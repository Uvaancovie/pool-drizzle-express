import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOzowOrderEmail = async (order: any) => {
  try {
    const statusText = order.status === 'pending' ? '⏳ Pending Payment' : '✅ Payment Complete';
    const { data, error } = await resend.emails.send({
      from: 'Pool Beanbags <orders@poolbeanbags.co.za>',
      to: ['orders@poolbeanbags.co.za'],
      subject: `${order.status === 'pending' ? '📋 New Order' : '✅ Order Paid'}: ${order.m_payment_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">New Order Received</h1>
          <div style="background-color: ${order.status === 'pending' ? '#fff3cd' : '#d4edda'}; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
            <p style="margin: 0; font-size: 16px;"><strong>Status:</strong> ${statusText}</p>
          </div>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <p><strong>Order Reference:</strong> ${order.m_payment_id}</p>
            <p><strong>Customer:</strong> ${order.customer?.name || 'N/A'}</p>
            <p><strong>Email:</strong> ${order.customer?.email_address || 'N/A'}</p>
            <p><strong>Phone:</strong> ${order.customer?.phone_number || 'N/A'}</p>
            <p><strong>Total:</strong> R${(order.total_cents / 100).toFixed(2)}</p>
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
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log('Email sent:', data?.id);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const sendPayfastOrderEmail = async (order: any) => {
  return sendOzowOrderEmail(order); // Reuse same template
};
