import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  update(data: Prisma.SettingsUpdateInput) {
    return this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.SettingsCreateInput) },
      update: data,
    });
  }
}
