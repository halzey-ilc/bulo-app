import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PartnerStatus, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { SettingsService } from '../common/settings.service';
import {
  ApprovePartnerDto,
  CreatePartnerDto,
  CreateUserDto,
  PartnerDto,
  ReasonDto,
  SettingsDto,
  UpdateUserDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles('ADMIN', 'MANAGER')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
  ) {}

  @Get('dashboard')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  dashboard() {
    return this.admin.dashboard();
  }

  // Партнёры: админ и менеджер; бухгалтер — только просмотр
  @Get('partners')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  partners(@Query('status') status?: PartnerStatus, @Query('search') search?: string) {
    return this.admin.partners(status, search);
  }

  @Get('partners/:id')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  partner(@Param('id') id: string) {
    return this.admin.partner(id);
  }

  @Post('partners')
  createPartner(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.admin.createPartner(user, dto);
  }

  @Patch('partners/:id')
  updatePartner(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PartnerDto) {
    return this.admin.updatePartner(user, id, dto);
  }

  @Post('partners/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApprovePartnerDto) {
    return this.admin.approvePartner(user, id, dto.priceTypeId, dto.oneCId);
  }

  @Post('partners/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.setPartnerStatus(user, id, 'REJECTED', dto.reason);
  }

  @Post('partners/:id/block')
  block(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.setPartnerStatus(user, id, 'BLOCKED', dto.reason);
  }

  @Post('partners/:id/unblock')
  unblock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.setPartnerStatus(user, id, 'APPROVED');
  }

  // Пользователи и роли — только администратор
  @Get('users')
  @Roles('ADMIN')
  users(@Query('role') role?: Role, @Query('search') search?: string) {
    return this.admin.users(role, search);
  }

  @Post('users')
  @Roles('ADMIN')
  createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(user, dto);
  }

  @Patch('users/:id')
  @Roles('ADMIN')
  updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(user, id, dto);
  }

  @Get('settings')
  async getSettings() {
    const s = await this.settings.get();
    return { ...s, minOrderSum: Number(s.minOrderSum) };
  }

  @Put('settings')
  @Roles('ADMIN')
  async putSettings(@Body() dto: SettingsDto) {
    const s = await this.settings.update(dto);
    return { ...s, minOrderSum: Number(s.minOrderSum) };
  }

  @Get('audit')
  @Roles('ADMIN')
  audit(@Query('entity') entity?: string, @Query('entityId') entityId?: string) {
    return this.admin.audit_(entity, entityId);
  }
}
