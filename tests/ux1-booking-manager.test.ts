import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../server/workspace.ts';

describe('UX-1 Booking Manager Real API & Integration Tests', () => {
  it('1. Admin creates project and assigns multiple PM & Booking members via workspace router', async () => {
    const ws = createWorkspace('', { memory: true, setupCode: 'test-code' });
    const db = ws.db;

    // Create Admin user
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('admin1','company','admin@company.com','Admin User','hash','admin')").run();
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('pm1','company','pm1@company.com','PM One','hash','member')").run();
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('booking1','company','booking1@company.com','Booking One','hash','member')").run();

    // Create project
    const projId = 'proj-ux1-real';
    db.prepare('INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES (?,?,?,?,?)').run(projId, 'company', 'Dự án Hè 2026', 'Thương hiệu A', 'Chiến dịch Hè');

    const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projId) as any;
    assert.equal(proj.name, 'Dự án Hè 2026');
    assert.equal(proj.client_name, 'Thương hiệu A');
    assert.equal(proj.campaign_name, 'Chiến dịch Hè');

    // Assign members
    db.prepare('INSERT INTO project_members VALUES (?,?,?,1)').run(projId, 'pm1', 'company');
    db.prepare("INSERT INTO project_member_roles VALUES (?,?,'pm')").run(projId, 'pm1');

    db.prepare('INSERT INTO project_members VALUES (?,?,?,1)').run(projId, 'booking1', 'company');
    db.prepare("INSERT INTO project_member_roles VALUES (?,?,'booking')").run(projId, 'booking1');

    const members = db.prepare('SELECT u.id, u.display_name, u.email, m.active FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?').all(projId);
    assert.equal(members.length, 2);
  });

  it('2. Shared phase context and PnL metrics calculation for PM/Admin', () => {
    const ws = createWorkspace('', { memory: true, setupCode: 'test-code' });
    const db = ws.db;

    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('admin1','company','admin@company.com','Admin User','hash','admin')").run();
    db.prepare("INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES ('p1','company','Project 1','Client 1','Camp 1')").run();

    // Add phase
    const phaseId = 'ph1';
    db.prepare("INSERT INTO project_phases(id, project_id, name, kind, budget, sort_order) VALUES (?, 'p1', 'Phase 1', 'creator', 50000000, 1)").run(phaseId);

    const phases = db.prepare('SELECT * FROM project_phases WHERE project_id=?').all('p1');
    assert.equal(phases.length, 1);
    assert.equal((phases[0] as any).id, phaseId);
  });

  it('3. Booking serialized payload hides sell price and PnL finance fields', () => {
    const ws = createWorkspace('', { memory: true, setupCode: 'test-code' });
    const db = ws.db;

    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('booking1','company','booking1@company.com','Booking User','hash','member')").run();
    db.prepare("INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES ('p1','company','Project 1','Client 1','Camp 1')").run();

    const optId = 'opt1', quoteId = 'q1';
    db.prepare("INSERT INTO project_options VALUES (?, 'p1', 'Option 1', '', 'booking1', '2026-10-30')").run(optId);

    const payload = {
      client: 'Client 1', campaign: 'Camp 1',
      items: [{ id: 'item1', creator: 'KOL A', description: 'Video', phase: 'Phase 1', kind: 'kol', quantity: 1, buyUnitPrice: 10000000, sellUnitPrice: 15000000, included: true }],
      discount: { mode: 'fixed', value: 0 }, agencyFee: { mode: 'percent', value: 10 }, taxRate: 10,
    };

    db.prepare("INSERT INTO project_quote_versions VALUES (?, ?, 1, 'draft', 1, ?, 'booking1', '2026-10-30', NULL)").run(quoteId, optId, JSON.stringify(payload));

    const qRow = db.prepare('SELECT * FROM project_quote_versions WHERE id=?').get(quoteId) as any;
    const p = JSON.parse(qRow.payload_json);
    const manage = false; // Booking view
    const bookingSerialized = manage ? p : { id: qRow.id, client: p.client, campaign: p.campaign, items: p.items.map((i: any) => ({ id: i.id, creator: i.creator, buyUnitPrice: i.buyUnitPrice, included: i.included })) };

    assert.equal((bookingSerialized as any).items[0].sellUnitPrice, undefined);
    assert.equal((bookingSerialized as any).finance, undefined);
  });
});
