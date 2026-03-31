import type { IHandler } from '@/handlers/IHandler';
import type { TranslationType } from '@/types/grid';
import { attributeHandler } from '@/handlers/attributeHandler';
import { chartHandler } from '@/handlers/chartHandler';
import { entityHandler } from '@/handlers/entityHandler';
import { viewHandler } from '@/handlers/viewHandler';

export function getHandler(type: TranslationType): IHandler | null {
  switch (type) {
    case 'attributes':
      return attributeHandler;
    case 'views':
      return viewHandler;
    case 'charts':
      return chartHandler;
    case 'entityMeta':
      return entityHandler;
    default:
      return null;
  }
}
