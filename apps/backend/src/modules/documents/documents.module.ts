import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProjectsModule } from '../projects';
import { DocumentsController } from './controllers/documents.controller';
import { DOCUMENT_STORAGE } from './models/document-storage';
import { S3DocumentStorage } from './services/s3-document-storage';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage }],
  exports: [DOCUMENT_STORAGE],
})
export class DocumentsModule {}
