import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/collections.json-schema';

export type ProductDocument = HydratedDocument<Product>;

@Schema({
  collection: COLLECTION_NAMES.PRODUCTS,
  timestamps: true,
  versionKey: false,
})
export class Product {
  @Prop({ type: Number, default: null, index: true })
  externalId: number | null;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  sku: string;

  @Prop({ type: String, default: null, trim: true })
  barcode: string | null;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 0 })
  priceCents: number;

  @Prop({ required: true, min: 0, default: 0 })
  costCents: number;

  @Prop({ required: true, min: 0, max: 10000, default: 1600 })
  taxRateBasisPoints: number;

  @Prop({ required: true, default: true })
  trackInventory: boolean;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ required: true, min: 0, default: 5 })
  minStockAlert: number;

  @Prop({
    required: true,
    enum: ['UNIT', 'KG', 'LITER'],
    default: 'UNIT',
  })
  unit: 'UNIT' | 'KG' | 'LITER';

  @Prop({ required: true, default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
