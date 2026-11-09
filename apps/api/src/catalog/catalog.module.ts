import { Module } from '@nestjs/common';
import { BranchesAdminController, StoriesAdminController } from './cafe-admin.controller';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController, CatalogAdminController, BranchesAdminController, StoriesAdminController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
