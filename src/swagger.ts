import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Mansa - Stablecoin FX & Remittance Sandbox')
    .setDescription(
      'Multi-currency wallet sandbox: deposits, FX swaps and cross-currency transfers across ' +
        'cNGN, cGHS, cXAF, USDx and EURx. All amounts are decimal strings. Money-moving endpoints ' +
        'require an Idempotency-Key header.',
    )
    .setVersion('1.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'docs-json' });
}
