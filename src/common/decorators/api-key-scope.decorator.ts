import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '../enums/role.enum';

export const API_KEY_SCOPE_KEY = 'api_key_scope';
export const RequireApiKeyScope = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPE_KEY, scopes);
