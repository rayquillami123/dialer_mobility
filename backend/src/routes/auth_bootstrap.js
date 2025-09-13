import express from "express";
import bcrypt from "bcrypt";

export default function makeBootstrapRouter(db) {
  const router = express.Router();

  // POST /api/auth/bootstrap
  router.post("/bootstrap", async (req, res) => {
    try {
      const hdr = req.headers["x-bootstrap-token"];
      if (!hdr || hdr !== process.env.BOOTSTRAP_TOKEN) {
        return res.status(401).json({ error: "invalid bootstrap token" });
      }

      const {
        tenantName = "Default Tenant",
        adminEmail,
        adminPassword,
        roles = ["admin"]
      } = req.body || {};

      if (!adminEmail || !adminPassword) {
        return res.status(400).json({ error: "adminEmail & adminPassword required" });
      }

      // crea tenant si no existe
      const { rows: trows } = await db.query(
        `INSERT INTO tenants (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenantName]
      );
      const tenantId = trows[0].id;

      // si ya existe usuario, sólo actualiza pass/roles
      const { rows: urows } = await db.query(
        `SELECT id FROM users WHERE email=$1 AND tenant_id=$2`,
        [adminEmail, tenantId]
      );

      const passHash = await bcrypt.hash(adminPassword, 12);

      if (urows.length) {
        // Find existing role IDs
        const roleRes = await db.query('SELECT id, code FROM roles WHERE code = ANY($1::text[])', [roles]);
        const roleIds = roleRes.rows.map(r => r.id);

        // Update user
        await db.query(
          `UPDATE users SET password_hash=$1, is_active=true WHERE id=$2`,
          [passHash, urows[0].id]
        );
        
        // Update roles
        await db.query('DELETE FROM user_roles WHERE user_id=$1', [urows[0].id]);
        for (const roleId of roleIds) {
            await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [urows[0].id, roleId]);
        }

      } else {
        const { rows: newUsers } = await db.query(
          `INSERT INTO users (email, password_hash, tenant_id, is_active)
           VALUES ($1,$2,$3,true) RETURNING id`,
          [adminEmail, passHash, tenantId]
        );
        const newUserId = newUsers[0].id;
        
        const roleRes = await db.query('SELECT id, code FROM roles WHERE code = ANY($1::text[])', [roles]);
        const roleIds = roleRes.rows.map(r => r.id);
        
        for (const roleId of roleIds) {
            await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [newUserId, roleId]);
        }
      }

      return res.json({ ok: true, tenantId, adminEmail, roles });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "bootstrap failed" });
    }
  });

  return router;
}
