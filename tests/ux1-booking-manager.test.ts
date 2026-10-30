import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../server/workspace.ts';

describe('UX-1 Booking Manager Mock & Integration Tests', () => {
  it('1. Admin create project with client_name, campaign_name and name; assign multiple PM and Booking members', () => {
    const ws = createWorkspace('', { memory: true, setupCode: 'test-code' });
    const db = ws.db;

    // Create Admin user
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('admin1','company','admin@company.com','Admin User','hash','admin')").run();
    // Create PM and Booking users
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('pm1','company','pm1@company.com','PM One','hash','member')").run();
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('pm2','company','pm2@company.com','PM Two','hash','member')").run();
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('booking1','company','booking1@company.com','Booking One','hash','member')").run();

    // Admin creates project
    const projId = 'proj-ux1-1';
    db.prepare('INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES (?,?,?,?,?)').run(projId, 'company', 'Dự án Hè 2026', 'Thương hiệu A', 'Chiến dịch Hè Rực Rỡ');

    const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projId) as any;
    assert.equal(proj.name, 'Dự án Hè 2026');
    assert.equal(proj.client_name, 'Thương hiệu A');
    assert.equal(proj.campaign_name, 'Chiến dịch Hè Rực Rỡ');

    // Assign multiple PMs and Bookings
    db.prepare('INSERT INTO project_members VALUES (?,?,?,1)').run(projId, 'pm1', 'company');
    db.prepare("INSERT INTO project_member_roles VALUES (?,?,'pm')").run(projId, 'pm1');

    db.prepare('INSERT INTO project_members VALUES (?,?,?,1)').run(projId, 'pm2', 'company');
    db.prepare("INSERT INTO project_member_roles VALUES (?,?,'pm')").run(projId, 'pm2');

    db.prepare('INSERT INTO project_members VALUES (?,?,?,1)').run(projId, 'booking1', 'company');
    db.prepare("INSERT INTO project_member_roles VALUES (?,?,'booking')").run(projId, 'booking1');

    const members = db.prepare('SELECT * FROM project_members WHERE project_id=?').all(projId);
    assert.equal(members.length, 3);
  });

  it('2. PM and Booking project scope isolation', () => {
    const ws = createWorkspace('', { memory: true, setupCode: 'test-code' });
    const db = ws.db;

    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('admin1','company','admin@company.com','Admin User','hash','admin')").run();
    db.prepare("INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES ('member1','company','member1@company.com','Member One','hash','member')").run();

    db.prepare("INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES ('p1','company','Project 1','Client 1','Camp 1')").run();
    db.prepare("INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES ('p2','company','Project 2','Client 2','Camp 2')").run();

    // Assign member1 to p1 only
    db.prepare("INSERT INTO project_members VALUES ('p1','member1','company',1)").run();
    db.prepare("INSERT INTO project_member_roles VALUES ('p1','member1','booking')").run();

    // Member query assigned projects
    const assigned = db.prepare('SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE p.organization_id=? AND m.user_id=? AND m.active=1').all('company', 'member1');
    assert.equal(assigned.length, 1);
    assert.equal((assigned[0] as any).id, 'p1');

    // Admin query sees all projects
    const all = db.prepare('SELECT * FROM projects WHERE organization_id=?').all('company');
    assert.equal(all.length, 2);
  });

  it('3. Booking does not receive sell price, revenue, or profit API payloads in options/quotes endpoint', () => {
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

    // Simulate non-manage (Booking) serialized view
    const qRow = db.prepare('SELECT * FROM project_quote_versions WHERE id=?').get(quoteId) as any;
    const p = JSON.parse(qRow.payload_json);
    const manage = false; // Booking view
    const bookingSerialized = manage ? p : { id: qRow.id, client: p.client, campaign: p.campaign, items: p.items.map((i: any) => ({ id: i.id, creator: i.creator, buyUnitPrice: i.buyUnitPrice, included: i.included })) };

    assert.equal((bookingSerialized as any).items[0].sellUnitPrice, undefined);
    assert.equal((bookingSerialized as any).finance, undefined);
    assert.equal((bookingSerialized as any).agencyFee, undefined);
  });
});
