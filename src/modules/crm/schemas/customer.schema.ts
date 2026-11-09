import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/collections.json-schema';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ _id: false })
export class ActiveDiscount {
  @Prop({ required: true, default: false })
  isAvailable: boolean;

  @Prop({ required: true, min: 0, max: 100, default: 0 })
  percentage: number;

  @Prop({ required: true, default: () => new Date() })
  assignedAt: Date;

  @Prop({ type: Types.ObjectId, default: null })
  assignedByUserId: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  consumedAt: Date | null;

  @Prop({ type: String, default: null })
  consumedInSaleNumber: string | null;
}

export const ActiveDiscountSchema =
  SchemaFactory.createForClass(ActiveDiscount);

@Schema()
export class DiscountHistoryItem {
  @Prop({ required: true, min: 0, max: 100 })
  percentage: number;

  @Prop({ type: Types.ObjectId, default: null })
  assignedByUserId: Types.ObjectId | null;

  @Prop({ required: true, default: () => new Date() })
  assignedAt: Date;

  @Prop({
    required: true,
    enum: ['ASSIGNED', 'CONSUMED', 'REPLACED'],
    default: 'ASSIGNED',
  })
  status: 'ASSIGNED' | 'CONSUMED' | 'REPLACED';

  @Prop({ type: Date, default: null })
  consumedAt: Date | null;

  @Prop({ type: String, default: null })
  consumedInSaleNumber: string | null;
}

export const DiscountHistoryItemSchema =
  SchemaFactory.createForClass(DiscountHistoryItem);

@Schema({
  collection: COLLECTION_NAMES.CUSTOMERS,
  timestamps: true,
  versionKey: false,
})
export class Customer {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({
    type: String,
    enum: ['LOCALES', 'CARRERAS'],
    default: 'LOCALES',
  })
  branch: 'LOCALES' | 'CARRERAS';

  @Prop({ type: ActiveDiscountSchema, required: true })
  activeDiscount: ActiveDiscount;

  @Prop({ type: [DiscountHistoryItemSchema], default: [] })
  discountHistory: DiscountHistoryItem[];

  @Prop({ required: true, default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
