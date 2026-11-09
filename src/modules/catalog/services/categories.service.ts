import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCategoryDto } from '../dto/catalog.dto';
import { Category, CategoryDocument } from '../schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.categoryModel
      .findOne({ slug: dto.slug.toLowerCase() })
      .lean();
    if (existing) {
      throw new ConflictException(
        `La categoría con slug "${dto.slug}" ya existe`,
      );
    }
    return this.categoryModel.create({
      ...dto,
      slug: dto.slug.toLowerCase(),
      isActive: true,
    });
  }

  async findAllCategories() {
    return this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }
}
