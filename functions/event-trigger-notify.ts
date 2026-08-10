import type { Request, Response } from 'express';

/**
 * Database Event Trigger: event-trigger-notify
 * 
 * Called by a Hasura Event Trigger when a new row is inserted into the `notifications` table.
 * Emulates sending Slack messages or sending emails.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { event } = req.body;
    const newRow = event.data?.new;

    if (!newRow) {
      return res.status(400).json({ message: 'No notification data found' });
    }

    const { id, channel, message, metadata } = newRow;

    console.log(`[EventTrigger-Notify] Notification ${id} received:`);
    console.log(`- Channel: ${channel}`);
    console.log(`- Message: ${message}`);
    console.log(`- Metadata:`, JSON.stringify(metadata));

    // Here you would connect to Slack or SendGrid.
    // Since we're demonstrating the pipeline, we log it and return success.
    // If Slack webhook is provided in metadata/config, the notify step executor would have already run it.
    // This Event Trigger serves as the asynchronous layer that picks up the logged notifications.

    return res.status(200).json({
      success: true,
      message: `Notification ${id} processed successfully via Event Trigger`,
    });
  } catch (error: any) {
    console.error('[EventTrigger-Notify] Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
