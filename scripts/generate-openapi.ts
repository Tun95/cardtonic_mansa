import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

/** Builds the OpenAPI document without connecting to the database (no app.init()). */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const doc = buildOpenApiDocument(app);
  writeFileSync(join(__dirname, '..', 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log('openapi.json written');
  await app.close();
}

void main();
