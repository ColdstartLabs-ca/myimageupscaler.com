import { describe, expect, test } from 'vitest';
import {
  CORE_AMPLITUDE_SCHEMA,
  CORE_AMPLITUDE_SCHEMA_DOCUMENT,
  DASHBOARD_CANONICAL_DEFINITIONS,
  buildCoreAmplitudeSchema,
  parseCliArgs,
  validateCoreAmplitudeSchema,
  type ICoreAmplitudeEventSchema,
  type ICoreAmplitudeSchemaDocument,
} from '@/scripts/validate-core-amplitude-schema';

function schemaWithEvent(
  eventName: string,
  update: (event: ICoreAmplitudeEventSchema) => ICoreAmplitudeEventSchema
): ICoreAmplitudeEventSchema[] {
  return buildCoreAmplitudeSchema().map(event =>
    event.eventName === eventName ? update(event) : event
  );
}

describe('validate-core-amplitude-schema script helpers', () => {
  test('exposes the PRD section 6 event set and dashboard canonical metadata', () => {
    expect(CORE_AMPLITUDE_SCHEMA).toHaveLength(19);
    expect(CORE_AMPLITUDE_SCHEMA_DOCUMENT.liveValidation.status).toBe('not_run');
    expect(DASHBOARD_CANONICAL_DEFINITIONS).toHaveLength(4);
    expect(DASHBOARD_CANONICAL_DEFINITIONS[0]).toMatchObject({
      dashboardName: 'KPI Dashboard',
      canonicalEvents: ['purchase_confirmed', 'checkout_opened'],
      validationStatus: 'template_pending_external_validation',
    });
    expect(DASHBOARD_CANONICAL_DEFINITIONS[1].canonicalEvents).toEqual(['revenue_received']);
  });

  test('passes the repository schema template without claiming external validation', () => {
    const result = validateCoreAmplitudeSchema(CORE_AMPLITUDE_SCHEMA_DOCUMENT);

    expect(result.valid).toBe(true);
    expect(result.eventCount).toBe(19);
    expect(result.observationWindowDays).toBe(0);
    expect(result.officialEventCount).toBe(0);
    expect(result.issues).toEqual([]);
  });

  test('rejects missing properties and malformed schema fields', () => {
    const missingPropertySchema = schemaWithEvent('processing_failed', event => {
      const properties = { ...event.properties };
      delete properties.requestId;
      return { ...event, properties };
    });
    const missingResult = validateCoreAmplitudeSchema(missingPropertySchema);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'events[processing_failed].properties',
          message: 'must contain exactly the canonical required and optional properties.',
        }),
        expect.objectContaining({
          path: 'events[processing_failed].properties.requestId',
          message: 'must contain a property schema object.',
        }),
      ])
    );

    const extraPropertySchema = schemaWithEvent('account_created', event => ({
      ...event,
      properties: {
        ...event.properties,
        unapprovedField: {
          type: 'string',
          description: 'Not in the canonical contract.',
          required: true,
          nullable: false,
          example: 'do-not-publish',
        },
      },
    }));
    expect(validateCoreAmplitudeSchema(extraPropertySchema).valid).toBe(false);
  });

  test('rejects out-of-scope events and enforces the seven-day/official gates when requested', () => {
    const withExtraEvent = [
      ...CORE_AMPLITUDE_SCHEMA,
      { ...CORE_AMPLITUDE_SCHEMA[0], eventName: 'legacy_event' as never },
    ];
    const extraResult = validateCoreAmplitudeSchema(withExtraEvent);
    expect(extraResult.valid).toBe(false);
    expect(extraResult.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'events[legacy_event]' })])
    );

    const incompleteDocument: ICoreAmplitudeSchemaDocument = {
      ...CORE_AMPLITUDE_SCHEMA_DOCUMENT,
      observationWindowDays: 3,
    };
    const incompleteResult = validateCoreAmplitudeSchema(incompleteDocument, {
      requireSevenDayObservation: true,
      requireOfficialEvents: true,
    });
    expect(incompleteResult.valid).toBe(false);
    expect(incompleteResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'observationWindowDays' }),
        expect.objectContaining({ path: 'events' }),
      ])
    );

    const verifiedDocument: ICoreAmplitudeSchemaDocument = {
      ...CORE_AMPLITUDE_SCHEMA_DOCUMENT,
      observationWindowDays: 7,
      reconciliationVerified: true,
      liveValidation: {
        status: 'verified',
        note: 'Synthetic unit-test fixture only.',
      },
      events: CORE_AMPLITUDE_SCHEMA.map(event => ({ ...event, official: true })),
    };
    const verifiedResult = validateCoreAmplitudeSchema(verifiedDocument, {
      requireSevenDayObservation: true,
      requireOfficialEvents: true,
    });
    expect(verifiedResult.valid).toBe(true);
    expect(verifiedResult.officialEventCount).toBe(19);
  });

  test('allows optional properties to be omitted from a representative example', () => {
    const schema = schemaWithEvent('monetization_surface_shown', event => {
      const example = { ...event.example };
      delete example.experimentAssignmentKey;
      return { ...event, example };
    });

    expect(validateCoreAmplitudeSchema(schema).valid).toBe(true);
  });

  test('rejects malformed unnamed entries as unexpected schema events', () => {
    const malformed = [
      ...CORE_AMPLITUDE_SCHEMA,
      { ...CORE_AMPLITUDE_SCHEMA[0], eventName: '' as never },
    ];
    const result = validateCoreAmplitudeSchema(malformed);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'events[19].eventName' })])
    );
  });

  test('requires explicit mode and live-read acknowledgment', () => {
    expect(() => parseCliArgs(['--mode', 'live', '--input', 'catalog.json'])).toThrow(
      '--allow-live-read'
    );
    expect(parseCliArgs(['--mode', 'test', '--template'])).toEqual({
      inputPath: undefined,
      json: false,
      mode: 'test',
      allowLiveRead: false,
      template: true,
      requireSevenDayObservation: false,
      requireOfficialEvents: false,
      help: false,
    });
  });
});
