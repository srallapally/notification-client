// notification.js
var _ = require('./lib/lodash4.js');
var __ = require('./utils/jsUtils.js');
const logger = require('winston');
const { getClient } = require('./lib/emailClientInit');

async function createNotificationTemplate(newTemplate) {
    // TODO: persist template to config store
    var name = newTemplate.name;
    delete newTemplate.name;
    // e.g., store template under key "emailTemplate/<name>"
}

async function getNotificationTemplates(forFrontend) {
    // TODO: retrieve all email templates from config store
    // e.g., query templates where _id starts with 'emailTemplate/'
    var templates = []; // replace with actual template retrieval

    if(!forFrontend){
        return templates;
    }
    var results = [];
    _.forEach(templates, function(template) {
        var split = template._id.split('emailTemplate/');
        var id = split[split.length - 1];
        var displayName = template.displayName || id;
        results.push({
            _id: id,
            displayName: displayName
        });
    })
    return {result: results};
}

async function getNotificationTemplate(templateId) {
    templateId = templateId.replace('emailTemplate-', 'emailTemplate/');
    // TODO: retrieve template by id from config store
    var template = null; // replace with actual template retrieval
    if(!template) {
        __.requestError('Notification ID: ' + templateId + ' not found', 404);
    }
    return template;
}

async function updateNotificationTemplate(notificationId, notificationObject) {
    // TODO: update template in config store
    // e.g., put notificationObject under key notificationId
}

async function sendNotificationTemplate(notificationId, object, to, cc) {
    if (_.startsWith(notificationId, 'emailTemplate/')) {
        notificationId = notificationId.replace('emailTemplate/', '');
    }

    // TODO: get template by notificationId
    // TODO: resolve placeholders in template with data from object
    // TODO: extract subject, html/text body, attachments from resolved template

    try {
        logger.verbose(`Notification template sending... notificationId:${notificationId}. to:${to}`);

        const emailClient = getClient();
        const result = await emailClient.send({
            to,
            cc: cc || undefined,
            subject: object.subject,
            body: object.html || object.text,
            isHtml: !!object.html,
            attachments: object.attachments
        });

        if (!result.success) {
            logger.info(`Notification template NOT sent. notificationId:${notificationId}. to:${to}. error:${result.error}`);
            return { message: 'failure', error: result.error };
        }

        logger.info(`Notification template sent. notificationId:${notificationId}. to:${to}. messageId:${result.messageId}`);
        return { message: 'success', messageId: result.messageId };
    }
    catch(e) {
        logger.warn("Error in sending notification template");
        logger.warn(e.message);
        return { message: 'failure', error: e };
    }
}

module.exports = {
    getNotificationTemplate: getNotificationTemplate,
    getNotificationTemplates: getNotificationTemplates,
    updateNotificationTemplate: updateNotificationTemplate,
    sendNotificationTemplate: sendNotificationTemplate,
    createNotificationTemplate: createNotificationTemplate
}