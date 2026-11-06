import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
})
export class AppModule {}
