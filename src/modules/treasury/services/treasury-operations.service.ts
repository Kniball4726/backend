import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  AuthenticatedUser,
  BranchName,
  UserRole,
} from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { CreateCashOperationDto } from '../dto/treasury.dto';

@Injectable()
export class TreasuryOperationsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  formatOperation(doc: Record<string, unknown>) {
    const amountCents = Number(doc.amountCents || 0);
    const createdDate =
      doc.createdAt instanceof Date
        ? doc.createdAt
        : new Date(String(doc.createdAt));

    return {
      id: String(doc._id),
      _id: String(doc._id),
      registerId: doc.registerId ? String(doc.registerId) : null,
      userId: doc.userId ? String(doc.userId) : null,
      userFullName: String(doc.userFullName || 'Operador'),
      branch: String(doc.branch || BranchName.LOCALES),
      type: doc.type as
        | 'INGRESO_EXTRAORDINARIO'
        | 'EGRESO_EXTRAORDINARIO'
        | 'TRANSFERENCIA_CAJAS'
        | 'GASTO',
      category: doc.category ? String(doc.category) : undefined,
      amountCents,
      amount: Number((amountCents / 100).toFixed(2)),
      detail: String(doc.detail || ''),
      createdAt: createdDate.toLocaleString('es-AR'),
      createdAtIso: createdDate.toISOString(),
    };
  }

  /**
   * Lista operaciones y gastos aplicando aislamiento por usuario:
   * - Rol CASHIER: ve únicamente los movimientos/gastos de sus propias cajas.
   * - Rol ADMIN / MASTER: ve todos los movimientos de la sucursal.
   */
  async listOperations(
    user: AuthenticatedUser,
    branch?: string,
    limit = 50,
  ) {
    const filter: Record<string, unknown> = {};
    if (user.role === UserRole.CASHIER) {
      filter.branch = user.branch || BranchName.LOCALES;
    } else if (branch && branch.trim()) {
      filter.branch = branch.trim().toUpperCase();
    }

    if (user.role === UserRole.CASHIER && Types.ObjectId.isValid(user.sub)) {
      filter.userId = new Types.ObjectId(user.sub);
    }

    const docs = await this.db
      .collection(COLLECTION_NAMES.CASH_OPERATIONS)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .toArray();

    return docs.map((d) =>
      this.formatOperation(d as unknown as Record<string, unknown>),
    );
  }

  /**
   * Registra una operación de caja o gasto impactando exclusivamente la caja abierta del operador.
   */
  async createOperation(dto: CreateCashOperationDto, user: AuthenticatedUser) {
    const branch =
      user.role === UserRole.CASHIER
        ? user.branch || BranchName.LOCALES
        : (dto.branch || user.branch || BranchName.LOCALES).trim().toUpperCase();
    const amountCents = Math.round(dto.amount * 100);
    if (amountCents <= 0) {
      throw new BadRequestException('El importe debe ser mayor a 0');
    }

    const registersCol = this.db.collection(COLLECTION_NAMES.CASH_REGISTERS);
    const userObjId = Types.ObjectId.isValid(user.sub)
      ? new Types.ObjectId(user.sub)
      : null;

    let openRegister = null;
    if (dto.registerId && Types.ObjectId.isValid(dto.registerId)) {
      const candidate = await registersCol.findOne({
        _id: new Types.ObjectId(dto.registerId),
        status: 'ABIERTA',
      });
      if (
        candidate &&
        user.role === UserRole.CASHIER &&
        candidate.userId &&
        candidate.userId.toString() !== user.sub
      ) {
        throw new ForbiddenException(
          'No puedes registrar gastos u operaciones sobre la caja de otro vendedor.',
        );
      }
      openRegister = candidate;
    } else if (userObjId) {
      // Buscar primero la caja abierta propia de este vendedor
      openRegister = await registersCol.findOne(
        { branch, userId: userObjId, status: 'ABIERTA' },
        { sort: { openedAt: -1 } },
      );
    }

    // Fallback para ADMIN/MASTER si operan sobre una caja general de la sucursal
    if (!openRegister && user.role !== UserRole.CASHIER) {
      openRegister = await registersCol.findOne(
        { branch, status: 'ABIERTA' },
        { sort: { openedAt: -1 } },
      );
    }

    if (!openRegister) {
      throw new BadRequestException({
        code: 'NO_OPEN_REGISTER_FOR_USER',
        message:
          'Debes tener tu propia caja abierta antes de registrar una operación o gasto.',
      });
    }

    const now = new Date();
    const opId = new Types.ObjectId();
    const opDoc = {
      _id: opId,
      registerId: openRegister._id,
      userId: userObjId,
      userFullName: user.fullName || 'Operador',
      branch,
      type: dto.type,
      category: dto.category || null,
      amountCents,
      detail: dto.detail.trim(),
      createdAt: now,
    };

    await this.db
      .collection(COLLECTION_NAMES.CASH_OPERATIONS)
      .insertOne(opDoc);

    const deltaCents =
      dto.type === 'INGRESO_EXTRAORDINARIO' ? amountCents : -amountCents;
    await registersCol.updateOne(
      { _id: openRegister._id },
      {
        $inc: { currentBalanceCents: deltaCents },
        $set: { updatedAt: now },
      },
    );

    return this.formatOperation(opDoc);
  }
}
