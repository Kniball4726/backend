import fastifyCompress from '@fastify/compress';
import fastifyHelmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  patchNestJsSwagger();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
  );

  // Seguridad y compresión Mobile-First
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });
  await app.register(fastifyCompress, {
    encodings: ['gzip', 'deflate'],
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // Contrato OpenAPI / Swagger para el equipo o cliente móvil
  const swaggerConfig = new DocumentBuilder()
    .setTitle('JustiMobile POS + CRM API')
    .setDescription(
      'API Backend DB-First (MongoDB Atlas $jsonSchema + Transacciones ACID) y Mobile-First (Fastify + Sincronización Delta + Idempotencia + Descuentos CRM de 1 uso)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description:
          'Clave API externa (jmk_live_...) creada por el usuario MASTER',
      },
      'x-api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port, '0.0.0.0');
  logger.log(`API ejecutándose en: http://localhost:${port}/api/v1`);
  logger.log(`Documentación Swagger OpenAPI en: http://localhost:${port}/docs`);
}

bootstrap();
