import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import mongoose, { Connection } from 'mongoose';
import { provisionMongoDatabase } from './db-provisioner';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        mongoose.set('sanitizeFilter', true);
        return {
          uri: config.getOrThrow<string>('MONGODB_URI'),
          autoIndex: false, // DB-First maneja los índices explícitamente en db-provisioner
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const autoProvision =
      this.configService.get<string>('DB_AUTO_PROVISION', 'true') === 'true';

    if (autoProvision && this.connection.db) {
      await provisionMongoDatabase(this.connection.db, { runSeed: false });
    } else {
      this.logger.log('Conexión a MongoDB Atlas establecida.');
    }
  }
}
