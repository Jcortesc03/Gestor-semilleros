import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, UsersModule],
})
export class AppModule {}
