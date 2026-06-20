import { runDashboardAuditSmoke } from './dashboard-ui-audit.mjs';
import { runDashboardBaseSmoke } from './dashboard-ui-base.mjs';
import { runDashboardLandedAndSteeringSmoke } from './dashboard-ui-landed.mjs';

export async function testDashboardUi(context, collectionDir, continuation) {
  await runDashboardBaseSmoke(context, collectionDir, continuation);
  await runDashboardAuditSmoke(context);
  await runDashboardLandedAndSteeringSmoke(context, collectionDir);
}
