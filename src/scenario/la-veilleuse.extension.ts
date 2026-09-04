/**
 * Couche d'extension du scénario « La Veilleuse ».
 *
 * Le fichier canonique `la-veilleuse.json` (04_SCENARIO_CONFIDENTIEL.json, copié tel quel)
 * reste la source des faits, déclarations, pièces, hypothèses et fins. Cette couche ajoute
 * uniquement la STRUCTURE que le JSON référence sans la définir (propositions), la lecture
 * mécanique des textes joueur (marqueurs de frise), les libellés joueur des faits, les
 * variantes de réponse et les liens mécaniques (remplacement de déclaration, révélation de
 * perception). Aucun secret nouveau n'est introduit : tout ce qui est ici découle du JSON.
 *
 * Voir DECISIONS.md, « Couche d'extension ».
 */
import type { ScenarioExtension } from '@/domain/model/scenario';

const s = (start: number, end: number) => ({ start, end });

// Les identifiants sont typés à la validation (Zod) ; ici on écrit des chaînes brutes.

export const laVeilleuseExtension = {
  propositions: [
    {
      id: 'prop_300_left_till',
      label: '300 € ont quitté le tiroir avant le comptage',
      semantics: { type: 'assertion', tags: ['cash-leaves-store'] },
      excludes: [],
      knowledgeTags: ['cash'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_refund_happened',
      label: 'Un remboursement manuel de 300 € a été versé à une cliente',
      semantics: {
        type: 'event',
        tags: ['refund', 'cash-leaves-store'],
        actorId: 'ana',
        zoneId: 'checkout',
        interval: s(90, 240),
        requiresPresence: true,
      },
      excludes: [
        'prop_counting_error',
        'prop_malik_took_300',
        'prop_mina_took_300',
        'prop_cash_in_safe',
        'prop_ana_unaware_all_evening',
        'prop_ana_no_unusual_drawer',
        'prop_ana_expected_deposit',
        'prop_sleeve_contained_cash',
      ],
      knowledgeTags: ['refund', 'cash'],
      costKeys: {
        ana: ['exposeRefund'],
        malik: ['exposeRefund'],
        mina: ['exposeRefund'],
        jo: ['exposeRefund'],
        noe: ['exposeRefund'],
      },
      truth: true,
    },
    {
      id: 'prop_customer_left_2052',
      label: 'Une personne extérieure est sortie du magasin à 20 h 52',
      semantics: {
        type: 'event',
        tags: ['exit', 'customer'],
        zoneId: 'entrance',
        interval: s(175, 185),
      },
      excludes: [],
      knowledgeTags: ['customer'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_ana_opened_drawer',
      label: 'Ana a ouvert le tiroir avec la clé responsable, hors transaction',
      semantics: {
        type: 'event',
        tags: ['drawer-open', 'manager-key'],
        actorId: 'ana',
        zoneId: 'checkout',
        interval: s(130, 150),
        requiresPresence: true,
      },
      excludes: ['prop_ana_no_unusual_drawer', 'prop_ana_unaware_all_evening'],
      knowledgeTags: ['drawer-open', 'ana'],
      costKeys: { ana: ['admitProcedureBreach'] },
      truth: true,
    },
    {
      id: 'prop_ana_no_unusual_drawer',
      label: "Ana n'a rien fait d'inhabituel avec la caisse après 20 h 40",
      semantics: { type: 'assertion', tags: ['no-unusual-drawer'], subjectId: 'ana' },
      excludes: ['prop_ana_opened_drawer', 'prop_refund_happened', 'prop_ana_knew_refund'],
      knowledgeTags: ['ana'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_ana_unaware_all_evening',
      label: "Ana n'a appris l'écart qu'au comptage final",
      semantics: { type: 'assertion', tags: ['unaware'], subjectId: 'ana' },
      excludes: ['prop_refund_happened', 'prop_ana_opened_drawer', 'prop_ana_knew_refund'],
      knowledgeTags: ['ana'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_ana_knew_refund',
      label: "Ana savait que l'argent correspondait à un remboursement hors procédure",
      semantics: { type: 'assertion', tags: ['refund', 'knowledge'], subjectId: 'ana' },
      excludes: [
        'prop_ana_unaware_all_evening',
        'prop_ana_expected_deposit',
        'prop_ana_no_unusual_drawer',
      ],
      knowledgeTags: ['refund', 'ana'],
      costKeys: { ana: ['admitProcedureBreach'] },
      truth: true,
    },
    {
      id: 'prop_ana_expected_deposit',
      label: 'Ana croyait confier une recette à déposer normalement',
      semantics: { type: 'assertion', tags: ['deposit'], subjectId: 'ana' },
      excludes: ['prop_ana_knew_refund', 'prop_refund_happened'],
      knowledgeTags: ['ana'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_ana_staged_theft',
      label: "Ana a organisé la disparition et l'interruption vidéo",
      semantics: { type: 'assertion', tags: ['staging'], subjectId: 'ana' },
      excludes: [
        'prop_ana_unaware_all_evening',
        'prop_ana_expected_deposit',
        'prop_kettle_caused_trip',
      ],
      knowledgeTags: ['ana', 'staging'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_malik_took_300',
      label: 'Malik a pris 300 € lors du transport de la pochette',
      semantics: { type: 'event', tags: ['theft'], actorId: 'malik', requiresPresence: true },
      excludes: [
        'prop_refund_happened',
        'prop_counting_error',
        'prop_cash_in_safe',
        'prop_mina_took_300',
      ],
      knowledgeTags: ['theft', 'malik'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_mina_took_300',
      label: 'Mina a pris 300 € sur le chariot',
      semantics: { type: 'event', tags: ['theft'], actorId: 'mina', requiresPresence: true },
      excludes: [
        'prop_refund_happened',
        'prop_counting_error',
        'prop_cash_in_safe',
        'prop_malik_took_300',
      ],
      knowledgeTags: ['theft', 'mina'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_counting_error',
      label: "L'écart vient d'un double comptage ou d'une saisie erronée",
      semantics: { type: 'assertion', tags: ['counting'] },
      excludes: [
        'prop_refund_happened',
        'prop_malik_took_300',
        'prop_mina_took_300',
        'prop_cash_in_safe',
      ],
      knowledgeTags: ['counting'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_cash_in_safe',
      label: 'Les 300 € ont été déposés au bureau sans être déduits du fond attendu',
      semantics: {
        type: 'object-location',
        objectTag: 'cash',
        zoneId: 'office',
        interval: s(260, 850),
      },
      excludes: [
        'prop_refund_happened',
        'prop_counting_error',
        'prop_malik_took_300',
        'prop_mina_took_300',
      ],
      knowledgeTags: ['cash', 'safe'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_camera_offline_4m20',
      label: "L'enregistreur est resté hors ligne 4 min 20",
      semantics: {
        type: 'event',
        tags: ['camera-offline'],
        zoneId: 'office',
        interval: s(500, 760),
      },
      excludes: [],
      knowledgeTags: ['camera-offline'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_local_overload',
      label: 'Le circuit partagé salle de pause–enregistreur a déclenché sur surcharge',
      semantics: {
        type: 'event',
        tags: ['breaker-trip', 'electrical-load'],
        zoneId: 'staffroom',
        interval: s(480, 560),
      },
      excludes: ['prop_camera_unplugged', 'prop_scheduled_reboot', 'prop_pallet_blocked_camera'],
      knowledgeTags: ['breaker-trip'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_kettle_caused_trip',
      label: 'La bouilloire de la salle de pause a fait déclencher le circuit',
      semantics: {
        type: 'event',
        tags: ['kettle', 'electrical-load'],
        actorId: 'ines',
        zoneId: 'staffroom',
        interval: s(480, 550),
        requiresPresence: true,
      },
      excludes: [
        'prop_camera_unplugged',
        'prop_scheduled_reboot',
        'prop_ines_cold_aisle_continuous',
        'prop_ana_staged_theft',
      ],
      knowledgeTags: ['kettle', 'staffroom'],
      costKeys: { ines: ['admitKettle'] },
      truth: true,
    },
    {
      id: 'prop_kettle_used_recently',
      label: 'La bouilloire a servi peu avant 21 h',
      semantics: { type: 'event', tags: ['kettle'], zoneId: 'staffroom', interval: s(480, 560) },
      excludes: [],
      knowledgeTags: ['kettle'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_camera_unplugged',
      label: "Quelqu'un a débranché l'enregistreur pour créer un angle mort",
      semantics: {
        type: 'event',
        tags: ['camera-unplugged'],
        zoneId: 'office',
        requiresPresence: true,
      },
      excludes: [
        'prop_local_overload',
        'prop_kettle_caused_trip',
        'prop_scheduled_reboot',
        'prop_pallet_blocked_camera',
      ],
      knowledgeTags: ['camera-unplugged'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_pallet_blocked_camera',
      label: 'La palette explique à elle seule la disparition des images',
      semantics: { type: 'assertion', tags: ['pallet', 'camera'] },
      excludes: ['prop_local_overload', 'prop_camera_unplugged', 'prop_scheduled_reboot'],
      knowledgeTags: ['pallet'],
      costKeys: { jo: ['admitObstruction'] },
      truth: false,
    },
    {
      id: 'prop_scheduled_reboot',
      label: "L'enregistreur a exécuté une maintenance automatique",
      semantics: { type: 'event', tags: ['reboot'], zoneId: 'office', interval: s(500, 760) },
      excludes: [
        'prop_local_overload',
        'prop_camera_unplugged',
        'prop_kettle_caused_trip',
        'prop_pallet_blocked_camera',
      ],
      knowledgeTags: ['reboot'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_pallet_present_2056',
      label: "La palette était dans l'allée froide avant 21 h",
      semantics: {
        type: 'object-location',
        objectTag: 'pallet',
        zoneId: 'cold_aisle',
        interval: s(414, 500),
      },
      excludes: ['prop_pallet_arrived_2102'],
      knowledgeTags: ['pallet'],
      costKeys: { jo: ['admitObstruction'] },
      truth: true,
    },
    {
      id: 'prop_pallet_arrived_2102',
      label: "La palette n'est entrée qu'après 21 h 02",
      semantics: { type: 'assertion', tags: ['pallet', 'late'], subjectId: 'jo' },
      excludes: ['prop_pallet_present_2056'],
      knowledgeTags: ['pallet'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_sleeve_left_office',
      label: "Malik a posé la pochette directement sur le bureau d'Ana",
      semantics: {
        type: 'presence',
        characterId: 'malik',
        zoneId: 'office',
        interval: s(250, 340),
      },
      excludes: ['prop_sleeve_left_trolley'],
      knowledgeTags: ['blue-sleeve', 'malik'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_sleeve_left_trolley',
      label: 'Malik a laissé la pochette sur le chariot de retours du rayon 1',
      semantics: {
        type: 'event',
        tags: ['blue-sleeve', 'returns-trolley'],
        actorId: 'malik',
        zoneId: 'aisle_one',
        interval: s(326, 350),
        requiresPresence: true,
      },
      excludes: ['prop_sleeve_left_office', 'prop_mina_saw_no_paperwork'],
      knowledgeTags: ['blue-sleeve', 'malik'],
      costKeys: { malik: ['admitNegligence'] },
      truth: true,
    },
    {
      id: 'prop_sleeve_contained_cash',
      label: 'La pochette contenait les 300 €',
      semantics: { type: 'assertion', tags: ['blue-sleeve', 'cash'] },
      excludes: ['prop_refund_happened'],
      knowledgeTags: ['blue-sleeve', 'cash'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_malik_carried_money',
      label: "Malik transportait de l'argent dans la pochette",
      semantics: { type: 'assertion', tags: ['malik', 'cash'] },
      excludes: [],
      knowledgeTags: ['malik', 'handover'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_receipt_should_be_in_sleeve',
      label: 'Le justificatif devait se trouver dans la pochette remise à Malik',
      semantics: { type: 'assertion', tags: ['pink-receipt', 'blue-sleeve'] },
      excludes: [],
      knowledgeTags: ['pink-receipt'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_receipt_existed',
      label: 'Un justificatif écrit de 300 € a existé',
      semantics: { type: 'assertion', tags: ['pink-receipt'] },
      excludes: ['prop_no_receipt_created'],
      knowledgeTags: ['pink-receipt'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_no_receipt_created',
      label: "Aucun document relatif aux 300 € n'a été créé",
      semantics: { type: 'assertion', tags: ['no-receipt'] },
      excludes: [
        'prop_receipt_existed',
        'prop_mina_hid_receipt',
        'prop_receipt_lost',
        'prop_receipt_destroyed',
      ],
      knowledgeTags: ['pink-receipt'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_receipt_destroyed',
      label: 'Ana a détruit le justificatif',
      semantics: {
        type: 'event',
        tags: ['pink-receipt', 'destroyed'],
        actorId: 'ana',
        zoneId: 'office',
        interval: s(260, 585),
        requiresPresence: true,
      },
      excludes: ['prop_mina_hid_receipt', 'prop_receipt_lost', 'prop_no_receipt_created'],
      knowledgeTags: ['pink-receipt', 'ana'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_receipt_lost',
      label: 'Un document a glissé du chariot sans être récupéré',
      semantics: {
        type: 'event',
        tags: ['pink-receipt', 'lost'],
        zoneId: 'stockroom',
        interval: s(500, 700),
      },
      excludes: ['prop_mina_hid_receipt', 'prop_receipt_destroyed', 'prop_no_receipt_created'],
      knowledgeTags: ['pink-receipt'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_mina_hid_receipt',
      label: "Mina a caché le justificatif après l'avoir trouvé",
      semantics: {
        type: 'event',
        tags: ['pink-receipt', 'hidden'],
        actorId: 'mina',
        zoneId: 'staffroom',
        interval: s(660, 740),
        requiresPresence: true,
      },
      excludes: [
        'prop_receipt_lost',
        'prop_receipt_destroyed',
        'prop_no_receipt_created',
        'prop_mina_saw_no_paperwork',
      ],
      knowledgeTags: ['pink-receipt', 'mina'],
      costKeys: { mina: ['admitHiddenReceipt'] },
      truth: true,
    },
    {
      id: 'prop_mina_saw_no_paperwork',
      label: "Il n'y avait ni argent ni document sur le chariot",
      semantics: {
        type: 'assertion',
        tags: ['returns-trolley', 'no-paperwork'],
        subjectId: 'mina',
      },
      excludes: ['prop_sleeve_left_trolley', 'prop_mina_hid_receipt'],
      knowledgeTags: ['returns-trolley', 'mina'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_trolley_hit_threshold',
      label: 'Une roue du chariot a heurté le seuil de la réserve',
      semantics: {
        type: 'sound',
        signatureTags: ['metal', 'door-like', 'brief'],
        intensity: 0.72,
        zoneId: 'stockroom',
        interval: s(525, 545),
        actorId: 'mina',
      },
      excludes: [],
      knowledgeTags: ['metal', 'returns-trolley'],
      costKeys: {},
      truth: true,
    },
    {
      id: 'prop_stockroom_door_slammed',
      label: "La porte de la réserve a claqué au passage d'une personne",
      semantics: {
        type: 'sound',
        signatureTags: ['door-like', 'brief', 'heavy'],
        intensity: 0.7,
        zoneId: 'stockroom',
        interval: s(520, 550),
      },
      excludes: [],
      knowledgeTags: ['door-like'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_bottle_was_reported_noise',
      label: 'Le bruit entendu par Noé était la bouteille brisée au rayon 2',
      semantics: {
        type: 'sound',
        signatureTags: ['sharp', 'glass', 'brief'],
        intensity: 0.8,
        zoneId: 'aisle_two',
        interval: s(338, 350),
      },
      excludes: [],
      knowledgeTags: ['glass'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_freezer_alarm',
      label: 'Une alarme technique du froid a été prise pour une porte',
      semantics: {
        type: 'sound',
        signatureTags: ['beep', 'electronic', 'continuous'],
        intensity: 0.5,
        zoneId: 'cold_aisle',
        interval: s(500, 560),
      },
      excludes: [],
      knowledgeTags: ['beep'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_ines_went_stockroom',
      label: 'Inès est entrée dans la réserve juste après le bruit',
      semantics: {
        type: 'perceived',
        observerId: 'noe',
        modality: 'visual',
        observerZoneId: 'loading',
        target: {
          characterId: 'ines',
          zoneId: 'cold_aisle',
          interval: s(535, 565),
          claimedTags: ['ines', 'toward-stockroom'],
          identityClaimed: true,
          soundTags: ['door-like', 'brief'],
        },
      },
      excludes: ['prop_ines_cold_aisle_continuous'],
      knowledgeTags: ['ines', 'toward-stockroom'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_ines_cold_aisle_continuous',
      label: "Inès est restée dans l'allée froide tout le temps",
      semantics: {
        type: 'continuous-presence',
        characterId: 'ines',
        zoneId: 'cold_aisle',
        interval: s(0, 1560),
      },
      excludes: ['prop_ines_went_stockroom', 'prop_kettle_caused_trip'],
      knowledgeTags: ['ines'],
      costKeys: {},
      truth: false,
    },
    {
      id: 'prop_trolley_maybe_door',
      label: 'Noé a entendu du métal et aperçu une silhouette ; il a complété le reste',
      semantics: {
        type: 'perceived',
        observerId: 'noe',
        modality: 'audio',
        observerZoneId: 'loading',
        target: {
          zoneId: 'stockroom',
          interval: s(520, 550),
          claimedTags: ['metal', 'door-like'],
          identityClaimed: false,
        },
      },
      excludes: [],
      knowledgeTags: ['metal', 'door-like'],
      costKeys: { noe: ['admitUncertainty'] },
      truth: true,
    },
    {
      id: 'prop_sleeve_was_empty_when_found',
      label: 'La pochette bleue était vide lorsque Jo l’a trouvée',
      semantics: {
        type: 'event',
        tags: ['blue-sleeve', 'empty'],
        actorId: 'jo',
        zoneId: 'office',
        interval: s(860, 890),
        requiresPresence: true,
      },
      excludes: [],
      knowledgeTags: ['blue-sleeve', 'jo'],
      costKeys: {},
      truth: true,
    },
  ],

  evidenceMarkers: [
    {
      evidenceId: 'e_till_report',
      zoneId: 'checkout',
      interval: s(1240, 1380),
      label: 'Écart de 300 € au comptage',
    },
    {
      evidenceId: 'e_camera_gap',
      zoneId: 'office',
      interval: s(500, 760),
      label: 'Flux vidéo absent',
    },
    { evidenceId: 'e_door_exit', zoneId: 'entrance', at: 180, label: 'Sortie non salariée' },
    {
      evidenceId: 'e_drawer_log',
      zoneId: 'checkout',
      at: 132,
      label: 'Ouverture manuelle du tiroir',
    },
    {
      evidenceId: 'e_pallet_scan',
      zoneId: 'cold_aisle',
      at: 414,
      label: 'Palette validée par le terminal',
    },
    {
      evidenceId: 'e_breaker_log',
      zoneId: 'office',
      interval: s(500, 760),
      label: 'Déclenchement du circuit partagé',
    },
    {
      evidenceId: 'e_warm_kettle',
      zoneId: 'staffroom',
      at: 540,
      label: 'Minuteur arrêté vers 20 h 58',
    },
    { evidenceId: 'e_trolley_mark', zoneId: 'stockroom', label: 'Trace de roue sur le seuil' },
    { evidenceId: 'e_blue_sleeve', zoneId: 'office', label: 'Pochette vide (objets trouvés)' },
    {
      evidenceId: 'e_pressure_imprint',
      zoneId: 'checkout',
      interval: s(120, 210),
      label: 'Empreinte du duplicata',
    },
    {
      evidenceId: 'e_hidden_receipt',
      zoneId: 'staffroom',
      label: 'Justificatif derrière la fiche d’entretien',
    },
  ],

  facts: [
    {
      factId: 'f_customer_return',
      label: 'Retour d’une cliente après l’heure des retours',
      revealedByEvidenceIds: [],
      reportedByStatementIds: [],
      revealedByConfrontationIds: ['c_ana_refund'],
    },
    {
      factId: 'f_manual_drawer_open',
      label: 'Ouverture manuelle du tiroir (clé responsable)',
      revealedByEvidenceIds: ['e_drawer_log'],
      reportedByStatementIds: [],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_cash_refund',
      label: 'Remboursement manuel de 300 € en espèces',
      revealedByEvidenceIds: ['e_hidden_receipt', 'e_pressure_imprint'],
      reportedByStatementIds: ['s_mina_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_receipt_written',
      label: 'Rédaction du justificatif rose signé A. Sorel',
      revealedByEvidenceIds: ['e_pressure_imprint', 'e_hidden_receipt'],
      reportedByStatementIds: ['s_mina_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_sleeve_handover',
      label: 'Remise d’une pochette bleue à Malik',
      revealedByEvidenceIds: [],
      reportedByStatementIds: ['s_malik_initial', 's_malik_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_sleeve_on_trolley',
      label: 'Pochette laissée sur le chariot de retours',
      revealedByEvidenceIds: [],
      reportedByStatementIds: ['s_malik_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_bottle_break',
      label: 'Bouteille brisée au rayon 2',
      revealedByEvidenceIds: [],
      reportedByStatementIds: ['s_malik_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_trolley_move',
      label: 'Chariot de retours poussé vers la réserve',
      revealedByEvidenceIds: ['e_trolley_mark'],
      reportedByStatementIds: ['s_mina_initial'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_pallet_placed',
      label: 'Palette déposée dans l’allée froide',
      revealedByEvidenceIds: ['e_pallet_scan'],
      reportedByStatementIds: ['s_jo_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_kettle_on',
      label: 'Bouilloire lancée en salle de pause',
      revealedByEvidenceIds: ['e_warm_kettle'],
      reportedByStatementIds: ['s_ines_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_camera_trip',
      label: 'Interruption de l’enregistreur vidéo',
      revealedByEvidenceIds: ['e_camera_gap', 'e_breaker_log'],
      reportedByStatementIds: [],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_trolley_bang',
      label: 'Choc métallique du chariot sur le seuil de la réserve',
      revealedByEvidenceIds: ['e_trolley_mark'],
      reportedByStatementIds: ['s_noe_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_receipt_falls',
      label: 'Le justificatif tombe de la pochette',
      revealedByEvidenceIds: [],
      reportedByStatementIds: ['s_mina_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_receipt_hidden',
      label: 'Justificatif glissé derrière la fiche d’entretien',
      revealedByEvidenceIds: ['e_hidden_receipt'],
      reportedByStatementIds: ['s_mina_clarified'],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_empty_sleeve_found',
      label: 'Pochette bleue retrouvée vide dans la réserve',
      revealedByEvidenceIds: ['e_blue_sleeve'],
      reportedByStatementIds: [],
      revealedByConfrontationIds: ['c_jo_sleeve'],
    },
    {
      factId: 'f_sleeve_in_drawer',
      label: 'Pochette déposée dans les objets trouvés du bureau',
      revealedByEvidenceIds: ['e_blue_sleeve'],
      reportedByStatementIds: [],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_count_complete',
      label: 'Comptage de fermeture : 300 € manquants',
      revealedByEvidenceIds: ['e_till_report'],
      reportedByStatementIds: [],
      revealedByConfrontationIds: [],
    },
    {
      factId: 'f_report_opened',
      label: 'Ouverture du rapport d’écart',
      revealedByEvidenceIds: [],
      reportedByStatementIds: [],
      revealedByConfrontationIds: [],
    },
  ],

  hypotheses: [
    {
      hypothesisId: 'h_emergency_refund',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['refund', 'cash-leaves-store'], requiresPresence: true },
      costKeys: {},
    },
    {
      hypothesisId: 'h_malik_theft',
      accusatory: true,
      worldEffect: { type: 'event', tags: ['theft'], requiresPresence: true },
      costKeys: {
        ana: ['accuseEmployee'],
        jo: ['accuseMalik'],
        mina: ['accuseMalik'],
        ines: ['signAccusation'],
        malik: ['signAccusation'],
        noe: ['accuseEmployee'],
      },
    },
    {
      hypothesisId: 'h_mina_theft',
      accusatory: true,
      worldEffect: { type: 'event', tags: ['theft'], requiresPresence: true },
      costKeys: {
        ana: ['accuseEmployee'],
        ines: ['signAccusation'],
        malik: ['signAccusation'],
        noe: ['accuseEmployee'],
      },
    },
    {
      hypothesisId: 'h_counting_error',
      accusatory: false,
      worldEffect: { type: 'none' },
      costKeys: {},
    },
    {
      hypothesisId: 'h_safe_transfer',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['cash', 'safe'], requiresPresence: false },
      costKeys: {},
    },
    {
      hypothesisId: 'h_circuit_overload',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['electrical-load'], requiresPresence: true },
      costKeys: {},
      actorCostKeys: ['admitKettle'],
    },
    {
      hypothesisId: 'h_deliberate_unplug',
      accusatory: true,
      worldEffect: { type: 'event', tags: ['camera-unplugged'], requiresPresence: true },
      costKeys: {},
    },
    {
      hypothesisId: 'h_pallet_camera',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['pallet'], requiresPresence: true },
      costKeys: {},
      actorCostKeys: ['admitObstruction'],
    },
    {
      hypothesisId: 'h_scheduled_reboot',
      accusatory: false,
      worldEffect: { type: 'none' },
      costKeys: {},
    },
    {
      hypothesisId: 'h_mina_hidden_receipt',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['pink-receipt', 'hidden'], requiresPresence: true },
      costKeys: { malik: ['admitNegligence'] },
    },
    {
      hypothesisId: 'h_ana_destroyed_receipt',
      accusatory: true,
      worldEffect: { type: 'event', tags: ['pink-receipt', 'destroyed'], requiresPresence: true },
      costKeys: { ines: ['accuseAna'] },
    },
    {
      hypothesisId: 'h_receipt_lost',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['pink-receipt', 'lost'], requiresPresence: false },
      costKeys: { malik: ['admitNegligence'] },
    },
    {
      hypothesisId: 'h_no_receipt',
      accusatory: false,
      worldEffect: { type: 'none' },
      costKeys: {},
    },
    {
      hypothesisId: 'h_trolley_threshold',
      accusatory: false,
      worldEffect: {
        type: 'sound',
        signatureTags: ['metal', 'door-like', 'brief'],
        intensity: 0.72,
      },
      costKeys: {},
    },
    {
      hypothesisId: 'h_stockroom_door',
      accusatory: false,
      worldEffect: {
        type: 'sound',
        signatureTags: ['door-like', 'brief', 'heavy'],
        intensity: 0.7,
      },
      costKeys: {},
    },
    {
      hypothesisId: 'h_bottle_noise',
      accusatory: false,
      worldEffect: { type: 'sound', signatureTags: ['sharp', 'glass', 'brief'], intensity: 0.8 },
      costKeys: {},
    },
    {
      hypothesisId: 'h_freezer_alarm',
      accusatory: false,
      worldEffect: {
        type: 'sound',
        signatureTags: ['beep', 'electronic', 'continuous'],
        intensity: 0.5,
      },
      costKeys: {},
    },
    {
      hypothesisId: 'h_ana_initiated_refund',
      accusatory: false,
      worldEffect: { type: 'event', tags: ['refund', 'decision'], requiresPresence: true },
      costKeys: {},
    },
    {
      hypothesisId: 'h_ana_unaware',
      accusatory: false,
      worldEffect: { type: 'none' },
      costKeys: {},
    },
    {
      hypothesisId: 'h_ana_deposit',
      accusatory: false,
      worldEffect: { type: 'none' },
      costKeys: {},
    },
    { hypothesisId: 'h_ana_staged', accusatory: true, worldEffect: { type: 'none' }, costKeys: {} },
  ],

  statements: [
    { statementId: 's_ana_initial', supersedes: [], revealsPerceptionIds: [], admitsCostKeys: [] },
    {
      statementId: 's_malik_initial',
      supersedes: [],
      revealsPerceptionIds: [],
      admitsCostKeys: [],
    },
    { statementId: 's_ines_initial', supersedes: [], revealsPerceptionIds: [], admitsCostKeys: [] },
    { statementId: 's_jo_initial', supersedes: [], revealsPerceptionIds: [], admitsCostKeys: [] },
    { statementId: 's_mina_initial', supersedes: [], revealsPerceptionIds: [], admitsCostKeys: [] },
    { statementId: 's_noe_initial', supersedes: [], revealsPerceptionIds: [], admitsCostKeys: [] },
    {
      statementId: 's_malik_clarified',
      supersedes: ['s_malik_initial'],
      revealsPerceptionIds: [],
      admitsCostKeys: ['admitNegligence'],
    },
    {
      statementId: 's_ines_clarified',
      supersedes: ['s_ines_initial'],
      revealsPerceptionIds: [],
      admitsCostKeys: ['admitKettle'],
    },
    {
      statementId: 's_jo_clarified',
      supersedes: ['s_jo_initial'],
      revealsPerceptionIds: [],
      admitsCostKeys: ['admitObstruction'],
    },
    {
      statementId: 's_mina_clarified',
      supersedes: ['s_mina_initial'],
      revealsPerceptionIds: ['p_mina_receipt', 'p_mina_sleeve'],
      admitsCostKeys: ['admitHiddenReceipt'],
    },
    {
      statementId: 's_noe_clarified',
      supersedes: ['s_noe_initial'],
      revealsPerceptionIds: ['p_noe_bang', 'p_noe_silhouette'],
      admitsCostKeys: ['admitUncertainty'],
    },
  ],

  confrontations: [
    {
      confrontationId: 'c_ana_drawer',
      responseVariants: {
        neutral:
          'Ana regarde le rapport de caisse sans le prendre. « Ma clé a pu servir. Ça ne veut pas dire ce que vous croyez. » Elle vous laisse consulter le journal d’ouverture, mais n’ira pas plus loin ce soir.',
        empathetic:
          'Ana souffle longuement. « Oui, ma clé a servi. Je vous dirai pourquoi quand je saurai ce que ça coûte à l’équipe. » Elle vous ouvre elle-même le journal des ouvertures manuelles.',
        direct:
          'Ana se redresse. « Vérifiez le journal si vous voulez. Ma clé a servi. Le reste ne vous regarde pas encore. » Le ton s’est refroidi.',
      },
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation: 'La clé d’Ana a ouvert le tiroir à 20 h 51 min 12 s. Hors transaction.',
    },
    {
      confrontationId: 'c_malik_route',
      responseVariants: {
        neutral:
          'Malik fixe le journal vidéo comme s’il pouvait encore le contredire. « Bon. Je ne suis pas allé au bureau. Je l’ai posée sur le chariot quand la bouteille a cassé. Je comptais la reprendre. »',
        empathetic:
          '« Vous voyez bien que je n’ai jamais quitté les rayons. » Malik baisse la voix. « Je l’ai posée sur le chariot, le temps de ramasser le verre. Je croyais qu’il y avait les 300 € dedans. J’ai eu peur d’être le suspect facile. »',
        direct:
          'Malik encaisse. « D’accord, pas le bureau. Le chariot de retours. J’y ai laissé la pochette une minute, la bouteille venait de casser. » Il ne vous regarde plus.',
      },
      retractsStatementIds: [],
      admitsCostKeys: { malik: ['admitNegligence'] },
      beliefUpdates: [],
      annotation:
        'Malik : la pochette est restée sur le chariot de retours, rayon 1, vers 20 h 54. Il croyait l’argent dedans.',
    },
    {
      confrontationId: 'c_jo_timing',
      responseVariants: {
        neutral:
          'Jo hausse les épaules. « Vérifiez le terminal. La palette était là avant 21 h. Je l’ai laissée dans le passage pour qu’on ne voie pas que la livraison était en retard. »',
        empathetic:
          '« Le retard n’est pas le sujet, Jo. » Iel expire. « La palette était dans l’allée froide avant 21 h. Je l’ai laissée là exprès, pour masquer le retard de Noé et le mien. Le terminal a l’heure. »',
        direct:
          'Jo pousse le terminal vers vous. « Regardez l’heure vous-même. » Iel ne commentera pas la raison.',
      },
      guardedVariant:
        'Jo pousse le terminal vers vous. « Regardez l’heure vous-même. » Iel ne commentera pas la raison.',
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation:
        'Palette validée à 20 h 56 min 54 s dans l’allée froide. Le passage vers la réserve était encombré pendant la coupure.',
    },
    {
      confrontationId: 'c_ines_camera',
      responseVariants: {
        neutral:
          'Inès regarde vers la salle de pause avant de répondre. « J’ai lancé la bouilloire. Les néons ont baissé et l’enregistreur s’est éteint. J’ai paniqué, mais je n’ai rien débranché. » Le diagnostic du circuit devient accessible.',
        empathetic:
          '« Personne ne va vous reprocher une bouilloire, Inès. » Elle se détend d’un cran. « J’étais en salle de pause. J’ai lancé la bouilloire, tout a baissé, l’enregistreur s’est coupé. J’ai cru que j’allais être renvoyée. » Elle vous montre la bouilloire encore tiède.',
        direct:
          'Inès se ferme. « Vérifiez le tableau électrique si vous voulez. Je n’ai touché à rien. » Elle ne dira rien de plus ce soir.',
      },
      guardedVariant:
        'Inès se ferme. « Vérifiez le tableau électrique si vous voulez. Je n’ai touché à rien. » Elle ne dira rien de plus ce soir.',
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation:
        'Circuit commun salle de pause – enregistreur : déclenchement sur surcharge, réarmement automatique.',
    },
    {
      confrontationId: 'c_noe_noise',
      responseVariants: {
        neutral:
          'Noé réfléchit vraiment pour la première fois. « Du métal, bref, du côté de la réserve. Et une silhouette, chaude, à travers la palette. Le visage… non. J’ai complété. » Il vous indique le seuil de la réserve.',
        empathetic:
          '« Vous étiez loin, Noé, et la palette était devant. » Il acquiesce. « Je n’ai pas vu le visage. J’ai entendu du métal, vu une silhouette chaude. J’ai dit Inès parce que c’est elle que je croise d’habitude. »',
        direct:
          'Noé se raidit. « Je n’ai pas vu le visage, d’accord. Du métal et une silhouette. Mais j’ai entendu quelque chose, ça je le maintiens. »',
      },
      retractsStatementIds: [],
      admitsCostKeys: { noe: ['admitUncertainty'] },
      beliefUpdates: [
        { characterId: 'noe', propositionId: 'prop_ines_went_stockroom', confidence: 0.1 },
        { characterId: 'noe', propositionId: 'prop_trolley_maybe_door', confidence: 0.8 },
      ],
      annotation:
        'Noé : perception ≠ conclusion. Métal + silhouette chaude ; l’identité a été complétée.',
    },
    {
      confrontationId: 'c_mina_trolley',
      responseVariants: {
        neutral:
          'Mina confirme le trajet du chariot jusqu’à la réserve. « Une roue a accroché le seuil, oui. » Sur le document, elle ne bouge pas : « Rien qui ressemblait à un papier. »',
        empathetic:
          'Mina hoche la tête. « J’ai poussé le chariot jusqu’à la réserve. Une roue a tapé le seuil, ça a résonné. » Elle marque une pause avant de répéter qu’il n’y avait aucun document.',
        direct:
          '« Le chariot, oui. Le seuil, oui. » Mina croise les bras. « Le reste, je l’ai déjà dit. »',
      },
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation:
        'Trace métallique fraîche sur le seuil de la réserve : le chariot y est bien passé.',
    },
    {
      confrontationId: 'c_jo_sleeve',
      responseVariants: {
        neutral:
          'Jo réfléchit. « Une pochette bleue, vide, sur une étagère de la réserve. Je l’ai mise dans les objets trouvés du bureau. »',
        empathetic:
          '« Vous avez trouvé quelque chose dans la réserve, Jo ? » Iel hésite puis : « Une pochette bleue. Vide. Je l’ai rangée dans le tiroir des objets trouvés, je pensais bien faire. »',
        direct:
          'Jo soupire. « Une pochette vide. Bureau, tiroir des objets trouvés. Allez vérifier. »',
      },
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation: 'Pochette bleue retrouvée vide dans la réserve, déposée au bureau vers 21 h 03.',
    },
    {
      confrontationId: 'c_ana_refund',
      responseVariants: {
        neutral:
          'Ana pose la main sur le carnet de duplicatas. « Une cliente est revenue après l’heure des retours. Je l’ai reçue. » Elle ne prononce pas le mot remboursement, mais vous laisse regarder la feuille suivante du carnet.',
        empathetic:
          '« Ana, la porte a enregistré une sortie à 20 h 52. Qui était-ce ? » Elle ferme les yeux un instant. « Une cliente. Un appareil défectueux, un enfant qui pleurait. Je l’ai reçue après l’heure. » Elle pousse le carnet vers vous.',
        direct:
          '« Ma clé, la porte, d’accord. » Ana serre la mâchoire. « Une cliente est revenue. C’est tout ce que vous obtiendrez ce soir. » Vous examinez le carnet sans son aide.',
      },
      retractsStatementIds: ['s_ana_initial'],
      admitsCostKeys: { ana: ['admitProcedureBreach'] },
      beliefUpdates: [],
      annotation:
        'Une cliente reçue après l’heure des retours. Le duplicata parle de 300 €, signé A. Sorel.',
    },
    {
      confrontationId: 'c_mina_receipt',
      responseVariants: {
        neutral:
          'Mina regarde longuement l’empreinte du duplicata. « Le papier est tombé de la pochette quand la roue a tapé. J’ai reconnu la signature d’Ana. Je l’ai glissé derrière la fiche d’entretien. Un remboursement hors procédure, ça peut lui coûter sa place. »',
        empathetic:
          '« Vous avez protégé quelqu’un, Mina. » Elle s’assoit. « La pochette s’est ouverte. Le papier rose, la signature d’Ana, 300. Je l’ai caché derrière la fiche d’entretien de la salle de pause. Je ne voulais pas qu’on la mette dehors pour ça. »',
        direct:
          'Mina se lève. « Vous avez une empreinte et une trace de roue. Très bien. Cherchez. » Elle quitte la pièce sans un mot de plus.',
      },
      guardedVariant:
        'Mina se lève. « Vous avez une empreinte et une trace de roue. Très bien. Cherchez. » Elle quitte la pièce sans un mot de plus.',
      retractsStatementIds: [],
      admitsCostKeys: {},
      beliefUpdates: [],
      annotation:
        'Le justificatif est derrière la fiche d’entretien. Mina l’a caché pour protéger Ana.',
    },
  ],

  characters: [
    {
      characterId: 'ana',
      costLabels: {
        admitProcedureBreach: 'admettre un remboursement hors procédure',
        accuseEmployee: 'désigner un membre de l’équipe',
        exposeRefund: 'voir le remboursement exposé',
      },
      reactions: {
        signs: 'Ana relit chaque ligne, puis signe d’un trait net.',
        refusesAccusation:
          'Ana repousse le rapport. « Je ne signerai pas une version qui me fait porter ça. »',
        refusesBelief:
          'Ana secoue la tête. « Ce n’est pas ce qui s’est passé, et vous le savez peut-être déjà. »',
        signsSilently: 'Ana signe sans relire. Elle n’a pas d’objection à formuler.',
        requestsChange: 'Ana pointe un emplacement du rapport. « Changez ça, et on en reparle. »',
        probeNeutral: 'Ana écoute l’hypothèse jusqu’au bout, sans la commenter.',
        probeDirectAccused:
          'Ana se ferme. « Si c’est ça votre version, cherchez une autre signature. »',
        probeEvidenceUnknown:
          'Ana regarde la pièce. « Je ne vois pas ce que vous voulez que j’en dise. »',
      },
    },
    {
      characterId: 'malik',
      costLabels: {
        admitNegligence: 'admettre avoir laissé la pochette sans surveillance',
        signAccusation: 'signer une accusation',
        exposeRefund: 'voir le remboursement exposé',
      },
      reactions: {
        signs: 'Malik lit deux fois, puis signe. « Tant que ça ne dit pas que j’ai volé. »',
        refusesAccusation: 'Malik se lève. « Je ne signerai jamais ça. Jamais. »',
        refusesBelief: 'Malik fronce les sourcils. « Ce n’est pas ce que j’ai vu. »',
        signsSilently: 'Malik signe vite, sans regarder les autres.',
        requestsChange: 'Malik tape sur une ligne. « Enlevez ça et je signe. »',
        probeNeutral: 'Malik hausse une épaule. « Possible. Je n’étais pas là. »',
        probeDirectAccused:
          'Malik blêmit. « Vous cherchez le suspect facile. Je ne suis pas d’accord. »',
        probeEvidenceUnknown: 'Malik regarde la pièce sans comprendre ce qu’on attend de lui.',
      },
    },
    {
      characterId: 'ines',
      costLabels: {
        admitKettle: 'admettre la bouilloire et la coupure',
        accuseAna: 'accuser Ana',
        signAccusation: 'signer une accusation',
      },
      reactions: {
        signs: 'Inès signe en s’assurant que son nom n’est associé à rien de grave.',
        refusesAccusation: 'Inès rougit. « Je ne signerai pas ça. »',
        refusesBelief: 'Inès hésite. « Ce n’est pas ce qui s’est passé. »',
        signsSilently: 'Inès signe sans un mot, le regard baissé.',
        requestsChange: 'Inès montre une ligne. « Là. Ce n’est pas juste. »',
        probeNeutral: 'Inès écoute, mal à l’aise, sans prendre parti.',
        probeDirectAccused: 'Inès se recule. « Je n’ai rien fait de ça. »',
        probeEvidenceUnknown: 'Inès jette un œil à la pièce. « Je ne sais pas. »',
      },
    },
    {
      characterId: 'jo',
      costLabels: {
        admitObstruction: 'admettre avoir laissé la palette dans le passage',
        accuseMalik: 'accuser Malik',
        exposeRefund: 'voir le remboursement exposé',
      },
      reactions: {
        signs: 'Jo signe rapidement. « Si tout le monde est d’accord. »',
        refusesAccusation: 'Jo secoue la tête. « Pas avec moi dedans. »',
        refusesBelief: 'Jo fronce les sourcils. « Ce n’est pas ça. »',
        signsSilently: 'Jo signe sans discuter ; iel préfère éviter le conflit.',
        requestsChange: 'Jo pointe la ligne. « Ça, non. »',
        probeNeutral: 'Jo hausse les épaules. « Peut-être. »',
        probeDirectAccused: 'Jo se tait un long moment. « Non. »',
        probeEvidenceUnknown: 'Jo regarde ailleurs. « Je ne connais pas ce truc. »',
      },
    },
    {
      characterId: 'mina',
      costLabels: {
        admitHiddenReceipt: 'admettre avoir caché le justificatif',
        accuseMalik: 'accuser Malik',
        exposeRefund: 'voir le remboursement exposé',
      },
      reactions: {
        signs: 'Mina lit lentement, puis signe. « Que chacun garde sa place. »',
        refusesAccusation: 'Mina pose le stylo. « Non. Pas ça. »',
        refusesBelief: 'Mina regarde Ana, puis vous. « Ce n’est pas la vérité. »',
        signsSilently: 'Mina signe sans relever la tête. Personne ne lui a demandé autre chose.',
        requestsChange: 'Mina désigne l’emplacement. « Retirez ça. »',
        probeNeutral: 'Mina écoute, les mains croisées, sans répondre.',
        probeDirectAccused:
          'Mina se fige. « Je rends les choses à leur place. Je ne prends rien. »',
        probeEvidenceUnknown: 'Mina regarde la pièce comme un objet qu’il faudrait ranger.',
      },
    },
    {
      characterId: 'noe',
      costLabels: {
        admitUncertainty: 'admettre ne pas avoir vraiment vu',
        accuseEmployee: 'désigner un membre de l’équipe',
        exposeRefund: 'voir le remboursement exposé',
      },
      reactions: {
        signs: 'Noé signe en regardant l’heure. « Si ça vous permet de conclure. »',
        refusesAccusation: 'Noé lève les mains. « Je ne signe pas ça. »',
        refusesBelief: 'Noé insiste. « Ce n’est pas ce que j’ai entendu. »',
        signsSilently: 'Noé signe sans lire jusqu’au bout.',
        requestsChange: 'Noé montre la ligne. « Corrigez ça au moins. »',
        probeNeutral: 'Noé hoche la tête. « Ça se tient, je suppose. »',
        probeDirectAccused: 'Noé rit nerveusement. « Moi ? Je livrais. »',
        probeEvidenceUnknown: 'Noé regarde la pièce. « Ce n’est pas mon magasin. »',
      },
    },
  ],

  endings: [
    {
      endingId: 'ending_transparent',
      hint: 'Une version qui nomme chaque faute sans inventer de coupable existe.',
    },
    {
      endingId: 'ending_protective',
      hint: 'Une version que presque tout le monde signe peut laisser un document dans l’ombre.',
    },
    {
      endingId: 'ending_scapegoat',
      hint: 'Une histoire simple trouve toujours des signataires, sauf celui qu’elle désigne.',
    },
    {
      endingId: 'ending_procedural',
      hint: 'Un dossier peut se refermer sur une anomalie sans jamais nommer personne.',
    },
    { endingId: 'ending_impossible', hint: 'Trop de contradictions, et la table se défait.' },
  ],

  cameraCoverage: {
    zoneIds: ['entrance', 'checkout', 'aisle_one', 'aisle_two'],
    gapEvidenceId: 'e_camera_gap',
    label: 'Caméra des zones centrales',
  },

  canonicalHypothesisBySlot: {
    noise_source: 'h_trolley_threshold',
    manager_knowledge: 'h_ana_initiated_refund',
  },

  roundTableRevelations: 2,
  hintAfterImpasses: 3,
} as unknown as ScenarioExtension;
