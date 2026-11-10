import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { AuthenticatedUser } from '../../common/enums/role.enum';
import {
  CloseRegisterDto,
  CreateCashOperationDto,
  OpenRegisterDto,
} from './dto/treasury.dto';
import { TreasuryOperationsService } from './services/treasury-operations.service';
import { TreasuryRegistersService } from './services/treasury-registers.service';
import { TreasurySummaryService } from './services/treasury-summary.service';

/**
 * TreasuryService Facade
 * Orquesta y expone de forma unificada los módulos de Tesorería:
 * - TreasuryRegistersService: Ciclo de vida de Cajas (Apertura, Cierre, Listado y ajuste ACID)
 * - TreasuryOperationsService: Registro y listado de Movimientos y Gastos de caja
 * - TreasurySummaryService: Arqueo contable y desglose de formas de pago
 */
@Injectable()
export class TreasuryService {
  public readonly registersService: TreasuryRegistersService;
  public readonly operationsService: TreasuryOperationsService;
  public readonly summaryService: TreasurySummaryService;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Optional() registersService?: TreasuryRegistersService,
    @Optional() operationsService?: TreasuryOperationsService,
    @Optional() summaryService?: TreasurySummaryService,
  ) {
    this.summaryService = summaryService || new TreasurySummaryService(this.connection);
    this.registersService =
      registersService ||
      new TreasuryRegistersService(this.connection, this.summaryService);
    this.operationsService =
      operationsService || new TreasuryOperationsService(this.connection);
  }

  // --- Ciclo de Vida de Cajas ---
  listRegisters(
    user: AuthenticatedUser,
    branch?: string,
    status?: 'ABIERTA' | 'CERRADA',
    targetUserId?: string,
  ) {
    return this.registersService.listRegisters(user, branch, status, targetUserId);
  }

  openRegister(dto: OpenRegisterDto, user: AuthenticatedUser) {
    return this.registersService.openRegister(dto, user);
  }

  closeRegister(
    registerId: string,
    user: AuthenticatedUser,
    dto?: CloseRegisterDto,
  ) {
    return this.registersService.closeRegister(registerId, user, dto);
  }

  getRegisterSummary(
    registerId: string,
    user: AuthenticatedUser,
    declaredCash?: number,
    existingRegisterDoc?: Record<string, unknown>,
  ) {
    return this.summaryService.getRegisterSummary(
      registerId,
      user,
      declaredCash,
      existingRegisterDoc,
    );
  }

  adjustOpenRegisterBalanceInTransaction(
    deltaCents: number,
    cashierId: string,
    branch = 'LOCALES',
    session?: ClientSession,
  ): Promise<void> {
    return this.registersService.adjustOpenRegisterBalanceInTransaction(
      deltaCents,
      cashierId,
      branch,
      session,
    );
  }

  // --- Movimientos y Gastos de Caja ---
  listOperations(user: AuthenticatedUser, branch?: string, limit = 50) {
    return this.operationsService.listOperations(user, branch, limit);
  }

  createOperation(dto: CreateCashOperationDto, user: AuthenticatedUser) {
    return this.operationsService.createOperation(dto, user);
  }
}
