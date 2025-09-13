import express from "express";
import bcrypt from "bcrypt";

export default function makeBootstrapRouter(db) {
  const router = express.Router();

  // simple rate limit (evita fuerza bruta al bootstrap)
  let lastTry = 0;
  router.use((req, res, next) => {
    const now = Date.now();
    if (now - lastTry < 1500) return res.status(429).json({ error: "Too many requests" });
    lastTry = now; next();
  });

  router.post("/bootstrap", async (req, res) => {
    const hdr = req.headers["x-bootstrap-token"];
    if (!hdr || hdr !== process.env.BOOTSTRAP_TOKEN) {
      return res.status(401).json({ error: "invalid bootstrap token" });
    }
    const { tenantName="Default Tenant", adminEmail, adminPassword, roles=["admin"] } = req.body || {};
    if (!adminEmail || !adminPassword) {
      return res.status(400).json({ error: "adminEmail & adminPassword required" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // comprueba si ya se usó
      const f = await client.query(`SELECT value FROM app_flags WHERE key='bootstrap' FOR UPDATE`);
      if (f.rows.length && f.rows[0].value?.used === true) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "bootstrap already used" });
      }

      const t = await client.query(
        `INSERT INTO tenants (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`, [tenantName]
      );
      const tenantId = t.rows[0].id;

      const u = await client.query(
        `SELECT id FROM users WHERE email=$1 AND tenant_id=$2`,
        [adminEmail, tenantId]
      );
      const passHash = await bcrypt.hash(adminPassword, 12);
      let userId;

      if (u.rows.length) {
        userId = u.rows[0].id;
        await client.query(
          `UPDATE users SET password_hash=$1, is_active=true WHERE id=$2`,
          [passHash, userId]
        );
      } else {
        const newUser = await client.query(
          `INSERT INTO users (email, password_hash, tenant_id, is_active, name)
           VALUES ($1,$2,$3,true,$4) RETURNING id`,
          [adminEmail, passHash, tenantId, adminEmail.split('@')[0]]
        );
        userId = newUser.rows[0].id;
      }

      // Roles
      await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
      if (roles.length > 0) {
        const roleRes = await client.query('SELECT id FROM roles WHERE code = ANY($1::text[])', [roles]);
        for (const roleRow of roleRes.rows) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRow.id]);
        }
      }

      // marca el bootstrap como usado
      await client.query(
        `INSERT INTO app_flags(key, value) VALUES('bootstrap','{"used": true}')
         ON CONFLICT (key) DO UPDATE SET value='{"used": true}', updated_at=now()`
      );

      await client.query("COMMIT");
      return res.json({ ok: true, tenantId, adminEmail, roles });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(e);
      return res.status(500).json({ error: "bootstrap failed" });
    } finally {
      client.release();
    }
  });

  return router;
}
