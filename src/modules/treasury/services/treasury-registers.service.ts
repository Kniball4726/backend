import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import {
  AuthenticatedUser,
  BranchName,
  UserRole,
} from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { CloseRegisterDto, OpenRegisterDto } from '../dto/treasury.dto';
import { TreasurySummaryService } from './treasury-summary.service';

@Injectable()
export class TreasuryRegistersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly summaryService: TreasurySummaryService,
  ) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  formatRegister(doc: Record<string, unknown>) {
    const initialCents = Number(doc.initialBalanceCents || 0);
    const currentCents = Number(doc.currentBalanceCents || 0);
    const openedDate =
      doc.openedAt instanceof Date
        ? doc.openedAt
        : new Date(String(doc.openedAt));
    const closedDate = doc.closedAt
      ? doc.closedAt instanceof Date
        ? doc.closedAt
        : new Date(String(doc.closedAt))
      : null;

    return {
      id: String(doc._id),
      _id: String(doc._id),
      userId: doc.userId ? String(doc.userId) : null,
      userFullName: String(doc.userFullName || 'Operador'),
      branch: String(doc.branch || BranchName.LOCALES),
      boxType: doc.boxType as 'Ventas Sucursal' | 'Caja Consolidada',
      openedAt: openedDate.toLocaleString('es-AR'),
      openedAtIso: openedDate.toISOString(),
      closedAt: closedDate ? closedDate.toLocaleString('es-AR') : null,
      closedAtIso: closedDate ? closedDate.toISOString() : null,
      status: doc.status as 'ABIERTA' | 'CERRADA',
      initialBalanceCents: initialCents,
      currentBalanceCents: currentCents,
      initialBalance: Number((initialCents / 100).toFixed(2)),
      currentBalance: Number((currentCents / 100).toFixed(2)),
      observations: String(doc.observations || ''),
    };
  }

  /**
   * Lista cajas aplicando aislamiento por usuario:
   * - Rol CASHIER: ve sus propias cajas (abiertas y cerradas).
   * - Rol ADMIN / MASTER: ve todas las cajas de la sucursal o puede filtrar por userId.
   */
  async listRegisters(
    user: AuthenticatedUser,
    branch?: string,
    status?: 'ABIERTA' | 'CERRADA',
    targetUserId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (user.role === UserRole.CASHIER) {
      if (Types.ObjectId.isValid(user.sub)) {
        filter.userId = new Types.ObjectId(user.sub);
      }
      if (branch && branch.trim()) {
        filter.branch = branch.trim().toUpperCase();
      }
    } else {
      if (branch && branch.trim()) {
        filter.branch = branch.trim().toUpperCase();
      }
      if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
        filter.userId = new Types.ObjectId(targetUserId);
      }
    }
    if (status) {
      filter.status = status;
    }

    const docs = await this.db
      .collection(COLLECTION_NAMES.CASH_REGISTERS)
      .find(filter)
      .sort({ openedAt: -1 })
      .limit(100)
      .toArray();

    return docs.map((d) =>
      this.formatRegister(d as unknown as Record<string, unknown>),
    );
  }

  /**
   * Abre una caja para el usuario autenticado:
   * - Cada vendedor (CASHIER) puede tener su propia caja "Ventas Sucursal" abierta en paralelo con otros vendedores,
   *   pero no puede abrir dos cajas "Ventas Sucursal" simultáneas para sí mismo en ninguna sucursal.
   * - Para abrir una "Caja Consolidada", no puede haber ninguna caja abierta en la sucursal y su saldo inicial
   *   suma el saldo final de la última caja cerrada de cada vendedor activo en la sucursal.
   */
  async openRegister(dto: OpenRegisterDto, user: AuthenticatedUser) {
    // Si es CASHIER, la sucursal es estrictamente la asignada por el ADMIN
    const branch =
      user.role === UserRole.CASHIER
        ? user.branch || BranchName.LOCALES
        : (dto.branch || user.branch || BranchName.LOCALES).trim().toUpperCase();
    const registersCol = this.db.collection(COLLECTION_NAMES.CASH_REGISTERS);
    const userObjId = Types.ObjectId.isValid(user.sub)
      ? new Types.ObjectId(user.sub)
      : null;

    let initialBalanceCents = 0;

    if (dto.boxType === 'Ventas Sucursal') {
      // Verificar que no haya una Caja Consolidada abierta bloqueando la sucursal
      const consolidatedOpen = await registersCol.findOne({
        branch,
        boxType: 'Caja Consolidada',
        status: 'ABIERTA',
      });
      if (consolidatedOpen) {
        throw new BadRequestException({
          code: 'CONSOLIDATED_REGISTER_OPEN',
          message:
            'Existe una Caja Consolidada abierta en la sucursal. Debe cerrarse antes de abrir cajas individuales de Ventas Sucursal.',
        });
      }

      // Verificar que ESTE vendedor no tenga ya su propia caja "Ventas Sucursal" abierta en ninguna sucursal
      if (userObjId) {
        const ownOpenRegister = await registersCol.findOne({
          userId: userObjId,
          boxType: 'Ventas Sucursal',
          status: 'ABIERTA',
        });
        if (ownOpenRegister) {
          throw new BadRequestException({
            code: 'USER_ALREADY_HAS_OPEN_REGISTER',
            message: `El operador ${user.fullName} ya tiene una caja "Ventas Sucursal" abierta en ${ownOpenRegister.branch}. Debe cerrarla antes de abrir otra.`,
          });
        }
      }
    } else if (dto.boxType === 'Caja Consolidada') {
      const anyOpen = await registersCol.findOne({
        branch,
        status: 'ABIERTA',
      });
      if (anyOpen) {
        throw new BadRequestException({
          code: 'OPEN_REGISTERS_EXIST_FOR_CONSOLIDATED',
          message:
            'Al abrir una Caja Consolidada no pueden haber cajas abiertas de ningún tipo para la sucursal.',
        });
      }

      // Sumar los saldos de la última caja cerrada de cada vendedor de la sucursal
      const lastClosedPerSeller = await registersCol
        .aggregate<{ lastBalanceCents: number }>([
          { $match: { branch, status: 'CERRADA', boxType: 'Ventas Sucursal' } },
          { $sort: { closedAt: -1 } },
          {
            $group: {
              _id: '$userId',
              lastBalanceCents: { $first: '$currentBalanceCents' },
            },
          },
        ])
        .toArray();

      initialBalanceCents = lastClosedPerSeller.reduce(
        (sum, r) => sum + Math.max(0, Number(r.lastBalanceCents || 0)),
        0,
      );
    }

    const now = new Date();
    const newId = new Types.ObjectId();
    const doc = {
      _id: newId,
      userId: userObjId,
      userFullName: user.fullName || 'Operador',
      branch,
      boxType: dto.boxType,
      status: 'ABIERTA' as const,
      initialBalanceCents,
      currentBalanceCents: initialBalanceCents,
      observations: dto.observations || null,
      openedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await registersCol.insertOne(doc);
    return this.formatRegister(doc);
  }

  /**
   * Cierra una caja abierta guardando el resumen de arqueo y formas de pago.
   * Cada vendedor solo puede cerrar su propia caja; ADMIN y MASTER pueden cerrar cualquiera.
   */
  async closeRegister(
    registerId: string,
    user: AuthenticatedUser,
    dto?: CloseRegisterDto,
  ) {
    if (!Types.ObjectId.isValid(registerId)) {
      throw new BadRequestException('ID de caja inválido');
    }

    const regObjId = new Types.ObjectId(registerId);
    const registersCol = this.db.collection(COLLECTION_NAMES.CASH_REGISTERS);
    const existing = await registersCol.findOne({ _id: regObjId });

    if (!existing) {
      throw new NotFoundException('Caja no encontrada');
    }

    if (
      user.role === UserRole.CASHIER &&
      existing.userId &&
      existing.userId.toString() !== user.sub
    ) {
      throw new ForbiddenException(
        'No tienes permiso para realizar el cierre de caja de otro vendedor.',
      );
    }

    if (existing.status === 'CERRADA') {
      throw new BadRequestException('Esta caja ya fue cerrada previamente.');
    }

    const summary = await this.summaryService.getRegisterSummary(
      registerId,
      user,
      dto?.declaredCash,
      existing,
    );

    const now = new Date();
    const finalObservations =
      dto?.observations?.trim() || existing.observations || null;

    const updated = await registersCol.findOneAndUpdate(
      { _id: regObjId },
      {
        $set: {
          status: 'CERRADA',
          closedAt: now,
          currentBalanceCents: summary.expectedCashCents,
          observations: finalObservations,
          closureSummary: summary,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );

    return {
      ...this.formatRegister(updated as unknown as Record<string, unknown>),
      closureSummary: summary,
    };
  }

  /**
   * Impacta exclusivamente el saldo de la caja abierta ("Ventas Sucursal") del vendedor (cashierId)
   * que realizó la venta o anulación dentro de la transacción ACID.
   */
  async adjustOpenRegisterBalanceInTransaction(
    deltaCents: number,
    cashierId: string,
    branch = 'LOCALES',
    session?: ClientSession,
  ): Promise<void> {
    if (!this.connection.db || deltaCents === 0) return;

    const registersCol = this.connection.db.collection(
      COLLECTION_NAMES.CASH_REGISTERS,
    );
    const branchUpper = branch.toUpperCase();

    // 1. Intentar impactar la caja abierta propia de este vendedor específico
    if (Types.ObjectId.isValid(cashierId)) {
      const updatedOwn = await registersCol.findOneAndUpdate(
        {
          branch: branchUpper,
          userId: new Types.ObjectId(cashierId),
          boxType: 'Ventas Sucursal',
          status: 'ABIERTA',
        },
        {
          $inc: { currentBalanceCents: deltaCents },
          $set: { updatedAt: new Date() },
        },
        {
          sort: { openedAt: -1 },
          session,
        },
      );

      if (updatedOwn) {
        return;
      }
    }

    // 2. Fallback: si existe una caja de sucursal sin usuario asignado o de turno general
    await registersCol.findOneAndUpdate(
      {
        branch: branchUpper,
        boxType: 'Ventas Sucursal',
        status: 'ABIERTA',
      },
      {
        $inc: { currentBalanceCents: deltaCents },
        $set: { updatedAt: new Date() },
      },
      {
        sort: { openedAt: -1 },
        session,
      },
    );
  }
}
