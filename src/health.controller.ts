import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health (Estado y Conectividad Móvil)')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary:
      'Heartbeat ligero para que el cliente móvil detecte conectividad y hora oficial del servidor',
  })
  check() {
    return {
      status: 'ok',
      service: 'justimobile-pos-crm-api',
      serverTimestamp: new Date().toISOString(),
    };
  }
}
