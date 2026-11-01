import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './decorators';
import { PrismaService } from './prisma.service';

export interface JwtPayload {
  sub: string;
  v: number;
}

/**
 * Проверяет JWT и подгружает пользователя. Заблокированные, с истёкшим доступом
 * или со сменившейся версией токена — отклоняются.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Требуется вход');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { partner: true },
      });
      const expired = user?.accessExpiresAt && user.accessExpiresAt < new Date();
      if (!user || user.status !== 'ACTIVE' || expired || user.tokenVersion !== payload.v) {
        throw new Error('inactive');
      }
      if (user.partner?.status === 'BLOCKED') throw new Error('partner blocked');
      req.user = user;
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Сессия недействительна, войдите снова');
    }
  }
}
