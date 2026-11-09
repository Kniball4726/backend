import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/collections.json-schema';

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;

@Schema({
  collection: COLLECTION_NAMES.INVENTORY_MOVEMENTS,
  timestamps: true,
  versionKey: false,
})
export class InventoryMovement {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['INITIAL', 'SALE', 'ADJUSTMENT', 'RETURN', 'RESTOCK'],
  })
  type: 'INITIAL' | 'SALE' | 'ADJUSTMENT' | 'RETURN' | 'RESTOCK';

  @Prop({ required: true })
  quantityDelta: number;

  @Prop({ required: true, min: 0 })
  previousStock: number;

  @Prop({ required: true, min: 0 })
  newStock: number;

  @Prop({ type: Types.ObjectId, default: null })
  referenceId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const InventoryMovementSchema =
  SchemaFactory.createForClass(InventoryMovement);
