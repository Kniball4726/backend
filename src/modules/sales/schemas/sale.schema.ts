import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/collections.json-schema';

export type SaleDocument = HydratedDocument<Sale>;

@Schema({ _id: false })
export class SaleCustomerSnapshot {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  discountPercentageApplied: number;
}

export const SaleCustomerSnapshotSchema =
  SchemaFactory.createForClass(SaleCustomerSnapshot);

@Schema()
export class SaleItem {
  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPriceCents: number;

  @Prop({ required: true, min: 0, default: 1600 })
  taxRateBasisPoints: number;

  @Prop({ required: true, min: 0 })
  lineSubtotalCents: number;
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

@Schema()
export class SalePayment {
  @Prop({ required: true, enum: ['CASH', 'CARD', 'TRANSFER'] })
  method: 'CASH' | 'CARD' | 'TRANSFER';

  @Prop({ required: true, min: 0 })
  amountCents: number;

  @Prop({ type: String, default: null })
  reference: string | null;
}

export const SalePaymentSchema = SchemaFactory.createForClass(SalePayment);

@Schema({ _id: false })
export class SaleAfipInvoice {
  @Prop({ required: true })
  cae: string;

  @Prop({ required: true })
  caeVto: string;

  @Prop({ required: true })
  cbteTipo: number;

  @Prop({ required: true })
  puntoVenta: number;

  @Prop({ required: true })
  cbteNumero: number;

  @Prop({ required: true })
  docTipo: number;

  @Prop({ required: true })
  docNro: string;

  @Prop({ type: String, default: null })
  qrData: string | null;

  @Prop({ type: Date, default: Date.now })
  emitidoAt: Date;
}

export const SaleAfipInvoiceSchema =
  SchemaFactory.createForClass(SaleAfipInvoice);

@Schema({
  collection: COLLECTION_NAMES.SALES,
  timestamps: true,
  versionKey: false,
})
export class Sale {
  @Prop({ required: true, unique: true })
  receiptNumber: string;

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, required: true })
  cashierId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, ref: 'cash_registers' })
  registerId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  customerId: Types.ObjectId | null;

  @Prop({ type: SaleCustomerSnapshotSchema, default: null })
  customerSnapshot: SaleCustomerSnapshot | null;

  @Prop({ type: [SaleItemSchema], required: true })
  items: SaleItem[];

  @Prop({ required: true, min: 0 })
  subtotalCents: number;

  @Prop({ required: true, min: 0, max: 100, default: 0 })
  discountPercentageApplied: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountCents: number;

  @Prop({ required: true, min: 0 })
  taxCents: number;

  @Prop({ required: true, min: 0 })
  totalCents: number;

  @Prop({ type: [SalePaymentSchema], required: true })
  payments: SalePayment[];

  @Prop({
    required: true,
    enum: ['COMPLETED', 'CANCELLED'],
    default: 'COMPLETED',
  })
  status: 'COMPLETED' | 'CANCELLED';

  @Prop({ type: SaleAfipInvoiceSchema, default: null })
  afipInvoice: SaleAfipInvoice | null;

  @Prop({ type: Date, default: null })
  deviceTimestamp: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
