import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fmtRate } from '../common/money';
import { FxRatesQueryDto, FxRatesResponseDto } from './dto/fx-rates.dto';
import { FxService } from './fx.service';

@ApiTags('FX')
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Current conversion rates between all supported stablecoins' })
  @ApiOkResponse({ type: FxRatesResponseDto })
  async rates(@Query() query: FxRatesQueryDto): Promise<FxRatesResponseDto> {
    const { snapshot, quotes } = await this.fx.listRates(query.base);
    return {
      source: snapshot.source,
      refreshedAt: snapshot.refreshedAt.toISOString(),
      rates: quotes.map((q) => ({
        from: q.from,
        to: q.to,
        rate: fmtRate(q.rate),
        source: q.source,
        refreshedAt: q.refreshedAt.toISOString(),
      })),
    };
  }
}
