import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_ENV, type AppEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  const env = app.get<AppEnv>(APP_ENV);
  app.enableShutdownHooks();
  await app.listen(env.port);
}

void bootstrap();
