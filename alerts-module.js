
const nodemailer = require('nodemailer');

async function checkAndSendAlerts(pool) {
    console.log('[Alerts] Iniciando revisión de compromisos...');

    try {
        // 1. Get SMTP Config & Admins
        const configRes = await pool.query("SELECT * FROM configuracion WHERE clave IN ('smtp_email', 'smtp_pass', 'commerce_name', 'alert_hour')");
        const config = {};
        configRes.rows.forEach(r => config[r.clave] = r.valor);

        if (!config.smtp_email || !config.smtp_pass) {
            console.log('[Alerts] Falta configuración SMTP. Omitiendo.');
            return;
        }

        const adminsRes = await pool.query("SELECT email FROM usuarios WHERE rol = 'admin' AND activo = true");
        const adminEmails = adminsRes.rows.map(r => r.email);

        if (adminEmails.length === 0) {
            console.log('[Alerts] No hay administradores activos para notificar.');
            return;
        }

        // 2. Alert Logic Rule (Only run if hour >= 9 AM, unless forced)
        // Note: The setInterval in server.js determines frequency. 
        // We double check here if we want to be strict about "once a day" for daily alerts.
        // Logic: 
        // - Overdue: Send Daily.
        // - Future: Send Inter-daily (every 2 days).

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // 3. Fetch Candidates
        const query = `
            SELECT cp.*, p.nombre as proveedor_nombre,
            (cp.fecha_vencimiento - CURRENT_DATE) as days_remaining
            FROM compromisos_pago cp
            JOIN proveedores p ON cp.proveedor_id = p.id
            WHERE cp.estado != 'PAGADO'
        `;
        const res = await pool.query(query);
        const commitments = res.rows;

        let alertsToSend = [];
        let updatedIds = [];

        commitments.forEach(c => {
            const days = parseInt(c.days_remaining);
            const lastSent = c.last_alert_sent_at ? new Date(c.last_alert_sent_at).toISOString().split('T')[0] : null;

            let shouldSend = false;

            if (days < 0) {
                // Overdue: Send Daily (if not sent today)
                if (lastSent !== todayStr) shouldSend = true;
            } else if (days <= 5) { // Notify upcoming within 5 days
                // Future: Send Inter-daily (if not sent today AND not sent yesterday)
                if (!lastSent) shouldSend = true;
                else {
                    const lastDate = new Date(lastSent);
                    const diffTime = Math.abs(now - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays >= 2) shouldSend = true;
                }
            }

            if (shouldSend) {
                alertsToSend.push({ ...c, days });
                updatedIds.push(c.id);
            }
        });

        if (alertsToSend.length === 0) {
            console.log('[Alerts] No hay alertas pendientes para enviar en este momento.');
            return;
        }

        // 4. Generate HTML
        const tableRows = alertsToSend.map(c => {
            let statusColor = c.days < 0 ? '#ef4444' : '#f59e0b'; // Red vs Orange
            let statusText = c.days < 0 ? `Vencido hace ${Math.abs(c.days)} días` : `Vence en ${c.days} días`;

            return `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.proveedor_nombre}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.descripcion}<br><small style="color: #666;">Fact: ${c.numero_factura || '-'}</small></td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">$${parseFloat(c.monto_total_usd).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${new Date(c.fecha_vencimiento).toLocaleDateString()}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                </tr>
            `;
        }).join('');

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #1e293b; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin: 0;">${config.commerce_name || 'Sistema'} - Alertas de Pago</h2>
                    <p style="margin: 5px 0 0; opacity: 0.8;">${todayStr}</p>
                </div>
                <div style="padding: 20px;">
                    <p>Se han detectado <strong>${alertsToSend.length}</strong> compromisos que requieren atención:</p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: left;">
                                <th style="padding: 8px; border-bottom: 2px solid #ddd;">Proveedor</th>
                                <th style="padding: 8px; border-bottom: 2px solid #ddd;">Descripción</th>
                                <th style="padding: 8px; border-bottom: 2px solid #ddd; text-align: right;">Monto</th>
                                <th style="padding: 8px; border-bottom: 2px solid #ddd; text-align: right;">Vence</th>
                                <th style="padding: 8px; border-bottom: 2px solid #ddd;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    <div style="margin-top: 20px; text-align: center;">
                        <a href="#" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Ir al Sistema</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; color: #64748b; padding: 10px; text-align: center; font-size: 0.8em;">
                    Este es un reporte automático generado a las 09:00 AM.
                </div>
            </div>
        `;

        // 5. Send Email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: config.smtp_email, pass: config.smtp_pass }
        });

        const info = await transporter.sendMail({
            from: `"${config.commerce_name}" <${config.smtp_email}>`,
            to: adminEmails.join(', '), // Send to all admins
            subject: `⚠️ Alerta de Pagos Pendientes (${alertsToSend.length}) - ${todayStr}`,
            html: html
        });

        console.log('[Alerts] Correo enviado a:', adminEmails.join(', '));
        console.log('[Alerts] Message ID:', info.messageId);

        // 6. Update DB
        if (updatedIds.length > 0) {
            await pool.query(
                `UPDATE compromisos_pago SET last_alert_sent_at = NOW() WHERE id = ANY($1::int[])`,
                [updatedIds]
            );
            console.log(`[Alerts] Actualizados ${updatedIds.length} compromisos.`);
        }

        return { success: true, count: alertsToSend.length, recipients: adminEmails };

    } catch (err) {
        console.error('[Alerts] Error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = { checkAndSendAlerts };
