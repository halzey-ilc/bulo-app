import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { DeliveryService } from './delivery.service';
import { RoutingService } from './routing.service';

class LocationDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
  @IsOptional() @IsNumber() accuracy?: number;
  @IsOptional() @IsNumber() heading?: number;
  @IsOptional() @IsNumber() speed?: number;
}

class ShiftDto {
  @IsBoolean() on: boolean;
}

@Controller('courier')
@Roles('COURIER', 'ADMIN', 'MANAGER')
export class CourierController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Маршрут на сегодня: остановки по порядку, время прибытия, линия маршрута. */
  @Get('route')
  route(@CurrentUser() user: AuthUser) {
    return this.delivery.courierRoute(user);
  }

  /** Приложение курьера присылает геопозицию раз в 10–15 секунд, пока он на линии. */
  @Post('location')
  @Roles('COURIER')
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.delivery.saveLocation(user, dto);
  }

  @Post('shift')
  @Roles('COURIER')
  shift(@CurrentUser() user: AuthUser, @Body() dto: ShiftDto) {
    return this.delivery.setShift(user, dto.on);
  }

  @Post('orders/:id/arrived')
  arrived(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.delivery.arrived(user, id);
  }
}

class SuggestQuery {
  @IsString() @MaxLength(200) q: string;
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

class ReverseQuery {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
}

/** Поиск адреса для выбора точки доставки: подсказки по мере ввода и адрес под пином. */
@Controller('geo')
export class GeoController {
  constructor(private readonly routing: RoutingService) {}

  @Get('suggest')
  suggest(@Query() q: SuggestQuery) {
    return this.routing.suggest(q.q, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined);
  }

  @Get('reverse')
  reverse(@Query() q: ReverseQuery) {
    return this.routing.reverse(q.lat, q.lng);
  }
}

@Controller('orders')
export class TrackingController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Отслеживание доставки: этап, позиция курьера, маршрут, время прибытия. */
  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.delivery.tracking(user, id);
  }
}
