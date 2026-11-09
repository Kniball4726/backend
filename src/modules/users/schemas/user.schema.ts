import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BranchName, UserRole } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/collections.json-schema';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: COLLECTION_NAMES.USERS,
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.CASHIER,
  })
  role: UserRole;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(BranchName),
    default: BranchName.LOCALES,
  })
  branch: BranchName;

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;

  @Prop({ required: true, default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
