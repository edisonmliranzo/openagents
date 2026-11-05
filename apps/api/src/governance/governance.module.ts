import { Global, Module } from '@nestjs/common'
import { AuditLedgerService } from './audit-ledger.service'
import { InjectionFirewallService } from './injection-firewall.service'
import { PolicyRulesService } from './policy-rules.service'
import { AuditLedgerController, InjectionFirewallController, PolicyRulesController } from './governance.controller'

/** Governance & safety: policy-as-code guardrails, signed audit ledger, prompt-injection firewall. */
@Global()
@Module({
  controllers: [PolicyRulesController, AuditLedgerController, InjectionFirewallController],
  providers: [PolicyRulesService, AuditLedgerService, InjectionFirewallService],
  exports: [PolicyRulesService, AuditLedgerService, InjectionFirewallService],
})
export class GovernanceModule {}
