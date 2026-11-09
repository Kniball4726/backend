import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  Product,
  ProductDocument,
} from '../catalog/schemas/product.schema';
import { AdjustStockDto } from './dto/inventory.dto';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from './schemas/inventory-movement.schema';

@Injectable()
export class InventoryService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
  ) {}

  async adjustStock(dto: AdjustStockDto, userId: string) {
    if (!Types.ObjectId.isValid(dto.productId)) {
      throw new BadRequestException('ID de producto inválido');
    }

    const session = await this.connection.startSession();
    try {
      let result: Record<string, unknown> = {};

      await session.withTransaction(async () => {
        const product = await this.productModel
          .findById(dto.productId)
          .session(session)
          .exec();

        if (!product) {
          throw new NotFoundException('Producto no encontrado');
        }

        const previousStock = product.stock;
        const newStock = previousStock + dto.quantityDelta;

        if (newStock < 0) {
          throw new BadRequestException({
            code: 'NEGATIVE_STOCK_NOT_ALLOWED',
            message: `Stock insuficiente para realizar el ajuste. Stock actual: ${previousStock}`,
          });
        }

        product.stock = newStock;
        await product.save({ session });

        const [movement] = await this.movementModel.create(
          [
            {
              productId: product._id,
              userId: new Types.ObjectId(userId),
              type: dto.type,
              quantityDelta: dto.quantityDelta,
              previousStock,
              newStock,
              referenceId: null,
              notes: dto.notes ?? null,
            },
          ],
          { session },
        );

        result = {
          product: product.toObject(),
          movement: movement.toObject(),
        };
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async getProductMovements(productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('ID de producto inválido');
    }
    return this.movementModel
      .find({ productId: new Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }
}
