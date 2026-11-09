import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_SCOPE_KEY } from '../decorators/api-key-scope.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  ApiKeyScope,
  AuthenticatedUser,
  UserRole,
} from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method?: string;
      url?: string;
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // 1. El usuario MASTER humano tiene llave maestra universal a todo el sistema
    if (user.role === UserRole.MASTER && !user.isApiKey) {
      return true;
    }

    // 2. Si el acceso es mediante una API Key externa (X-API-Key)
    if (user.isApiKey) {
      // Ninguna API Key externa puede invocar endpoints exclusivos de MASTER
      if (
        requiredRoles &&
        requiredRoles.length === 1 &&
        requiredRoles[0] === UserRole.MASTER
      ) {
        throw new ForbiddenException(
          'Las claves API externas no tienen permiso para administrar la configuración MASTER.',
        );
      }

      const scopes = user.scopes || [];
      if (scopes.includes('*')) {
        return true;
      }

      const explicitScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
        API_KEY_SCOPE_KEY,
        [context.getHandler(), context.getClass()],
      );

      const neededScope =
        explicitScopes?.[0] ||
        this.inferScopeFromRequest(request.method || 'GET', request.url || '');

      if (neededScope) {
        if (scopes.includes(neededScope)) {
          return true;
        }
        // Si el endpoint requiere ":read" y la API Key posee ":write" del mismo dominio, se permite la lectura
        if (neededScope.endsWith(':read')) {
          const writeEquivalent = neededScope.replace(
            ':read',
            ':write',
          ) as ApiKeyScope;
          if (scopes.includes(writeEquivalent)) {
            return true;
          }
        }
      }

      throw new ForbiddenException(
        `La API Key (${user.apiKeyPrefix}) no cuenta con el scope requerido: "${neededScope ?? 'unknown'}". Scopes actuales: [${scopes.join(', ')}]`,
      );
    }

    // 3. Validación estándar de roles para usuarios autenticados por JWT
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los siguientes roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }

  private inferScopeFromRequest(
    method: string,
    url: string,
  ): ApiKeyScope | null {
    const isRead = method.toUpperCase() === 'GET';
    if (url.includes('/crm')) {
      return isRead ? 'crm:read' : 'crm:write';
    }
    if (url.includes('/catalog')) {
      return isRead ? 'catalog:read' : 'catalog:write';
    }
    if (url.includes('/inventory')) {
      return isRead ? 'inventory:read' : 'inventory:write';
    }
    if (url.includes('/sales')) {
      if (url.includes('/sales/preview')) {
        return 'sales:read';
      }
      return isRead ? 'sales:read' : 'sales:write';
    }
    if (url.includes('/treasury')) {
      return isRead ? 'treasury:read' : 'treasury:write';
    }
    return null;
  }
}
