import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../database/json-schemas/constants';
import {
  CreateCashOperationDto,
  OpenRegisterDto,
} from './dto/treasury.dto';

@Injectable()
export class TreasuryService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  private formatRegister(doc: Record<string, unknown>) {
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
      branch: String(doc.branch || 'PASTEUR'),
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

  private formatOperation(doc: Record<string, unknown>) {
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
      branch: String(doc.branch || 'PASTEUR'),
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
   * Lista cajas aplicando aislamiento por usuario:
   * - Rol CASHIER: ve exclusivamente sus propias cajas (abiertas y cerradas).
   * - Rol ADMIN / MASTER: ve todas las cajas de la sucursal o puede filtrar por userId.
   */
  async listRegisters(
    user: AuthenticatedUser,
    branch?: string,
    status?: 'ABIERTA' | 'CERRADA',
    targetUserId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (branch && branch.trim()) {
      filter.branch = branch.trim().toUpperCase();
    }
    if (status) {
      filter.status = status;
    }

    if (user.role === UserRole.CASHIER) {
      if (Types.ObjectId.isValid(user.sub)) {
        filter.userId = new Types.ObjectId(user.sub);
      }
    } else if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
      filter.userId = new Types.ObjectId(targetUserId);
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
   *   pero no puede abrir dos cajas "Ventas Sucursal" simultáneas para sí mismo.
   * - Para abrir una "Caja Consolidada", no puede haber ninguna caja abierta en la sucursal y su saldo inicial
   *   suma el saldo final de la última caja cerrada de cada vendedor activo en la sucursal.
   */
  async openRegister(dto: OpenRegisterDto, user: AuthenticatedUser) {
    const branch = (dto.branch || 'PASTEUR').trim().toUpperCase();
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

      // Verificar que ESTE vendedor no tenga ya su propia caja "Ventas Sucursal" abierta
      if (userObjId) {
        const ownOpenRegister = await registersCol.findOne({
          branch,
          userId: userObjId,
          boxType: 'Ventas Sucursal',
          status: 'ABIERTA',
        });
        if (ownOpenRegister) {
          throw new BadRequestException({
            code: 'USER_ALREADY_HAS_OPEN_REGISTER',
            message: `El operador ${user.fullName} ya tiene una caja "Ventas Sucursal" abierta en ${branch}. Debe cerrarla antes de abrir otra.`,
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
   * Cierra una caja abierta.
   * Si el usuario es CASHIER, solo puede cerrar su propia caja.
   */
  async closeRegister(registerId: string, user: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(registerId)) {
      throw new BadRequestException('ID de caja inválido');
    }

    const registersCol = this.db.collection(COLLECTION_NAMES.CASH_REGISTERS);
    const existing = await registersCol.findOne({
      _id: new Types.ObjectId(registerId),
    });

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

    const now = new Date();
    const updated = await registersCol.findOneAndUpdate(
      { _id: new Types.ObjectId(registerId) },
      {
        $set: {
          status: 'CERRADA',
          closedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );

    return this.formatRegister(updated as unknown as Record<string, unknown>);
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
    if (branch && branch.trim()) {
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
    const branch = (dto.branch || 'PASTEUR').trim().toUpperCase();
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

  /**
   * Impacta exclusivamente el saldo de la caja abierta ("Ventas Sucursal") del vendedor (cashierId)
   * que realizó la venta o anulación dentro de la transacción ACID.
   */
  async adjustOpenRegisterBalanceInTransaction(
    deltaCents: number,
    cashierId: string,
    branch = 'PASTEUR',
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
