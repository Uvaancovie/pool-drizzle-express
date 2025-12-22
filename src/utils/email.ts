import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendOzowOrderEmail = async (order: any) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Pool Beanbags" <orders@poolbeanbags.co.za>',
      to: 'orders@poolbeanbags.co.za',
      subject: `New Ozow Order Received: ${order.m_payment_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">New Ozow Order Received</h1>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <p><strong>Order Reference:</strong> ${order.m_payment_id}</p>
            <p><strong>Customer:</strong> ${order.customer?.name || 'N/A'}</p>
            <p><strong>Email:</strong> ${order.customer?.email_address || 'N/A'}</p>
            <p><strong>Phone:</strong> ${order.customer?.phone_number || 'N/A'}</p>
            <p><strong>Total:</strong> R${(order.total_cents / 100).toFixed(2)}</p>
            <p><strong>Status:</strong> ${order.status}</p>
          </div>
          
          <h3>Items:</h3>
          <ul>
            ${order.items?.map((item: any) => `
              <li>
                ${item.quantity}x ${item.title || item.name} - R${(item.price / 100).toFixed(2)}
              </li>
            `).join('')}
          </ul>

          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            This is an automated notification from the Pool Beanbags website.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};
