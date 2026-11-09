import {
  BadRequestException,
  Injectable,
  NotFoundException,
   Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { MasterService } from '../master/master.service';
import { AssignDiscountDto, CreateOrLoadCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';

@Injectable()
export class CrmService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @Optional() private readonly masterService?: MasterService,
  ) {}

  private async validateMasterCrmRules(discountPercentage: number) {
    if (!this.masterService) return;
    const settings = await this.masterService.getSettings();
    if (settings.maintenanceMode?.crmPaused) {
      throw new ServiceUnavailableException({
        code: 'CRM_PAUSED_BY_MASTER',
        message:
          settings.maintenanceMode.reason ||
          'El módulo CRM se encuentra temporalmente en mantenimiento por disposición del usuario MASTER.',
      });
    }
    if (discountPercentage > settings.maxCrmDiscountPercentage) {
      throw new BadRequestException({
        code: 'MAX_CRM_DISCOUNT_EXCEEDED',
        message: `El descuento solicitado (${discountPercentage}%) supera el tope máximo permitido por configuración MASTER (${settings.maxCrmDiscountPercentage}%).`,
      });
    }
  }

  /**
   * Registra un cliente en el CRM (o actualiza su descuento si el mail ya existe),
   * asignando automáticamente la fecha y hora del servidor.
   */
  async registerCustomerWithDiscount(
    dto: CreateOrLoadCustomerDto,
    crmUserId: string,
  ) {
    await this.validateMasterCrmRules(dto.discountPercentage);

    const now = new Date();
    const assignedByObjId = Types.ObjectId.isValid(crmUserId)
      ? new Types.ObjectId(crmUserId)
      : null;

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.customerModel
      .findOne({ email: normalizedEmail })
      .exec();

    const isDiscountAvailable = dto.discountPercentage > 0;

    if (existing) {
      // Si tenía un descuento previo sin usar y se le carga uno nuevo, se marca el anterior como REPLACED en el historial
      if (existing.activeDiscount?.isAvailable) {
        const lastAssigned = [...existing.discountHistory]
          .reverse()
          .find((h) => h.status === 'ASSIGNED');
        if (lastAssigned) {
          lastAssigned.status = 'REPLACED';
        }
      }

      existing.fullName = dto.fullName;
      existing.activeDiscount = {
        isAvailable: isDiscountAvailable,
        percentage: dto.discountPercentage,
        assignedAt: now,
        assignedByUserId: assignedByObjId,
        consumedAt: null,
        consumedInSaleNumber: null,
      };

      if (isDiscountAvailable) {
        existing.discountHistory.push({
          percentage: dto.discountPercentage,
          assignedByUserId: assignedByObjId,
          assignedAt: now,
          status: 'ASSIGNED',
          consumedAt: null,
          consumedInSaleNumber: null,
        });
      }

      await existing.save();
      const updatedObj = existing.toObject();
      if (isDiscountAvailable) {
        void this.masterService?.dispatchWebhookEvent(
          'customer.discount_assigned',
          updatedObj as unknown as Record<string, unknown>,
        );
      }
      return updatedObj;
    }

    const created = await this.customerModel.create({
      fullName: dto.fullName,
      email: normalizedEmail,
      activeDiscount: {
        isAvailable: isDiscountAvailable,
        percentage: dto.discountPercentage,
        assignedAt: now,
        assignedByUserId: assignedByObjId,
        consumedAt: null,
        consumedInSaleNumber: null,
      },
      discountHistory: isDiscountAvailable
        ? [
            {
              percentage: dto.discountPercentage,
              assignedByUserId: assignedByObjId,
              assignedAt: now,
              status: 'ASSIGNED',
              consumedAt: null,
              consumedInSaleNumber: null,
            },
          ]
        : [],
      isActive: true,
    });

    const createdObj = created.toObject();
    if (isDiscountAvailable) {
      void this.masterService?.dispatchWebhookEvent(
        'customer.discount_assigned',
        createdObj as unknown as Record<string, unknown>,
      );
    }
    return createdObj;
  }

  /**
   * Permite al rol CRM recargar un nuevo descuento porcentual de 1 uso a un cliente existente.
   */
  async assignDiscount(
    customerId: string,
    dto: AssignDiscountDto,
    crmUserId: string,
  ) {
    await this.validateMasterCrmRules(dto.discountPercentage);

    if (!Types.ObjectId.isValid(customerId)) {
      throw new NotFoundException('ID de cliente inválido');
    }

    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado en el CRM');
    }

    const now = new Date();
    const assignedByObjId = Types.ObjectId.isValid(crmUserId)
      ? new Types.ObjectId(crmUserId)
      : null;

    if (customer.activeDiscount?.isAvailable) {
      const lastAssigned = [...customer.discountHistory]
        .reverse()
        .find((h) => h.status === 'ASSIGNED');
      if (lastAssigned) {
        lastAssigned.status = 'REPLACED';
      }
    }

    customer.activeDiscount = {
      isAvailable: true,
      percentage: dto.discountPercentage,
      assignedAt: now,
      assignedByUserId: assignedByObjId,
      consumedAt: null,
      consumedInSaleNumber: null,
    };

    customer.discountHistory.push({
      percentage: dto.discountPercentage,
      assignedByUserId: assignedByObjId,
      assignedAt: now,
      status: 'ASSIGNED',
      consumedAt: null,
      consumedInSaleNumber: null,
    });

    await customer.save();
    return customer.toObject();
  }

  /**
   * Búsqueda rápida para el Cajero en el Punto de Venta (por nombre o correo)
   * o sincronización delta móvil (?updatedSince=).
   */
  async searchForPos(query?: string, onlyWithActiveDiscount?: boolean) {
    const filter: Record<string, unknown> = { isActive: true };

    if (query && query.trim().length > 0) {
      const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ fullName: regex }, { email: regex }];
    }

    if (onlyWithActiveDiscount) {
      filter['activeDiscount.isAvailable'] = true;
    }

    return this.customerModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
  }

  async findById(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new NotFoundException('ID de cliente inválido');
    }
    const customer = await this.customerModel.findById(customerId).lean();
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado en el CRM');
    }
    return customer;
  }

  /**
   * Consume atómicamente el descuento de un solo uso del cliente dentro de la
   * sesión transaccional ACID de la venta en MongoDB.
   */
  async consumeCustomerDiscountInTransaction(
    customerId: string,
    receiptNumber: string,
    session?: ClientSession,
  ): Promise<{
    customerId: Types.ObjectId;
    fullName: string;
    email: string;
    discountPercentage: number;
  }> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new BadRequestException('ID de cliente CRM inválido');
    }

    const now = new Date();
    const customer = await this.customerModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(customerId),
          isActive: true,
          'activeDiscount.isAvailable': true,
          'activeDiscount.percentage': { $gt: 0 },
        },
        {
          $set: {
            'activeDiscount.isAvailable': false,
            'activeDiscount.consumedAt': now,
            'activeDiscount.consumedInSaleNumber': receiptNumber,
          },
        },
        {
          new: false, // Devuelve el documento justo antes de consumir para leer el porcentaje exacto
          session,
        },
      )
      .exec();

    if (!customer) {
      throw new BadRequestException({
        code: 'CUSTOMER_DISCOUNT_UNAVAILABLE',
        message:
          'El cliente no tiene un descuento vigente disponible en el CRM o ya fue utilizado en una compra anterior.',
      });
    }

    const percentageApplied = customer.activeDiscount.percentage;

    // Registrar en el historial que fue consumido
    await this.customerModel
      .updateOne(
        {
          _id: customer._id,
          'discountHistory.status': 'ASSIGNED',
        },
        {
          $set: {
            'discountHistory.$.status': 'CONSUMED',
            'discountHistory.$.consumedAt': now,
            'discountHistory.$.consumedInSaleNumber': receiptNumber,
          },
        },
        { session },
      )
      .exec();

    return {
      customerId: customer._id,
      fullName: customer.fullName,
      email: customer.email,
      discountPercentage: percentageApplied,
    };
  }

  /**
   * Restaura el descuento CRM de un solo uso si se anula la venta en la que fue consumido.
   */
  async restoreCustomerDiscountInTransaction(
    customerId: string | Types.ObjectId,
    receiptNumber: string,
    session?: ClientSession,
  ): Promise<void> {
    const objId =
      customerId instanceof Types.ObjectId
        ? customerId
        : new Types.ObjectId(customerId);

    await this.customerModel
      .updateOne(
        {
          _id: objId,
          'activeDiscount.consumedInSaleNumber': receiptNumber,
        },
        {
          $set: {
            'activeDiscount.isAvailable': true,
            'activeDiscount.consumedAt': null,
            'activeDiscount.consumedInSaleNumber': null,
          },
        },
        { session },
      )
      .exec();

    await this.customerModel
      .updateOne(
        {
          _id: objId,
          'discountHistory.consumedInSaleNumber': receiptNumber,
        },
        {
          $set: {
            'discountHistory.$.status': 'ASSIGNED',
            'discountHistory.$.consumedAt': null,
            'discountHistory.$.consumedInSaleNumber': null,
          },
        },
        { session },
      )
      .exec();
  }
}
