/**
 * UiPath Processor Registry
 * Provides dynamic lookup for UiPath processors based on clientState tokens,
 * resource paths, or item metadata. Processors register themselves with a
 * simple descriptor so the dispatcher can remain agnostic of specific
 * SharePoint lists or document libraries.
 */

const { createCostcoProcessor } = require('../templates/costco-inline-routing');
const { createGenericDocumentProcessor } = require('../templates/generic-document-processor');
const { createLogger } = require('./logger');

// UiPath Processor Registry
const registry = [];

/**
 * Register a processor descriptor
 * @param {Object} descriptor
 * @param {string} descriptor.name - Unique processor name
 * @param {Function} descriptor.matches - Function receiving context { tokens, resource, item }
 * @param {Function} descriptor.factory - Factory returning processor instance
 */
function registerProcessor(descriptor) {
    if (!descriptor || !descriptor.name || typeof descriptor.factory !== 'function') {
        throw new Error('Invalid processor descriptor registration');
    }

    const exists = registry.find(entry => entry.name === descriptor.name);
    if (exists) {
        throw new Error(`Processor with name ${descriptor.name} already registered`);
    }

    registry.push(descriptor);
}

/**
 * Resolve processor descriptor based on notification details
 * @param {Object} params
 * @param {string} params.clientState
 * @param {string} params.resource
 * @param {Object} params.item
 * @returns {Object|null}
 */
function resolveProcessor(params = {}) {
    const tokens = parseClientState(params.clientState);

    for (const descriptor of registry) {
        try {
            if (descriptor.matches({ tokens, resource: params.resource, item: params.item })) {
                return descriptor;
            }
        } catch (error) {
            const logger = createLogger();
            logger.warn('Processor match evaluation failed', {
                processor: descriptor.name,
                error: error.message
            });
        }
    }

    return null;
}

/**
 * Return registered processor names (for diagnostics)
 */
function listProcessors() {
    return registry.map(entry => entry.name);
}

/**
 * Parse clientState string into normalized token array
 */
function parseClientState(clientState) {
    if (!clientState || typeof clientState !== 'string') {
        return [];
    }

    return clientState
        .split(';')
        .map(token => token.trim())
        .filter(Boolean)
        .map(token => token.toLowerCase());
}

// ---------------------------------------------------------------------------
// Default Processor Registrations
// ---------------------------------------------------------------------------

registerProcessor({
    name: 'costco-inline-routing',
    matches: ({ tokens, resource }) => {
        if (!tokens && !resource) {
            return false;
        }

        const tokenMatch = (tokens || []).some(token =>
            token.includes('costco') || token.includes('processor:costco')
        );

        const resourceMatch = resource ? resource.toLowerCase().includes('costco') : false;
        return tokenMatch || resourceMatch;
    },
    factory: (context, configOverrides) => {
        const processor = createCostcoProcessor(context, configOverrides);
        return {
            name: 'costco-inline-routing',
            process: async ({ item, previousItem, queueName, accessToken }) =>
                processor.processItem(item, previousItem, queueName, accessToken)
        };
    }
});

registerProcessor({
    name: 'generic-document',
    matches: ({ tokens, resource }) => {
        // Trigger when clientState explicitly requests document processing
        if (tokens && tokens.some(token => token.includes('processor:document'))) {
            return true;
        }

        // Fallback: detect common document library resource patterns
        if (resource) {
            const lower = resource.toLowerCase();
            return lower.includes('shared documents') || lower.includes('documents') || lower.includes('/drives/');
        }
        return false;
    },
    factory: context => {
        const processor = createGenericDocumentProcessor(context);
        return {
            name: 'generic-document',
            process: async ({ item, previousItem, queueName }) =>
                processor.processItem(item, previousItem, queueName)
        };
    }
});

module.exports = {
    registerProcessor,
    resolveProcessor,
    listProcessors,
    parseClientState
};
