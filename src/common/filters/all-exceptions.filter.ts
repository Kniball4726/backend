import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';

interface FastifyReplyLike {
  status(code: number): FastifyReplyLike;
  send(payload: unknown): void;
}

interface FastifyRequestLike {
  url: string;
  method: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReplyLike>();
    const request = ctx.getRequest<FastifyRequestLike>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Error interno del servidor';
    let details: unknown = undefined;

    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = 'Los datos enviados no cumplen con el esquema requerido';
      details = exception.getZodError().flatten();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const resObj = response as Record<string, unknown>;
        message = (resObj.message as string) || exception.message;
        code = (resObj.code as string) || HttpStatus[status] || 'HTTP_ERROR';
        details = resObj.details;
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception
    ) {
      const mongoErr = exception as {
        code?: number;
        errmsg?: string;
        errInfo?: unknown;
      };
      if (mongoErr.code === 11000) {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_KEY';
        message = 'Ya existe un registro con ese identificador único en MongoDB.';
      } else if (mongoErr.code === 121) {
        status = HttpStatus.BAD_REQUEST;
        code = 'DB_SCHEMA_VALIDATION_FAILED';
        message =
          'El motor de MongoDB Atlas rechazó el documento por violar las reglas $jsonSchema.';
        details = mongoErr.errInfo;
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'statusCode' in exception &&
      typeof (exception as any).statusCode === 'number'
    ) {
      const fastifyErr = exception as {
        statusCode: number;
        code?: string;
        message?: string;
      };
      status = fastifyErr.statusCode;
      code = fastifyErr.code || HttpStatus[status] || 'BAD_REQUEST';
      message = fastifyErr.message || 'Error en la petición';
    }

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    reply.status(status).send({
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
