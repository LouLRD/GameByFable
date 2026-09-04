// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_MIME, triggerDownload } from './exportImport';

describe('triggerDownload dans un navigateur', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('crée un lien de téléchargement, le clique, le retire puis révoque l’URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob.type).toBe(EXPORT_MIME);
      return 'blob:lva/export';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    triggerDownload('la-veilleuse-300_2026-09-04_21h12.json', '{"kind":"x"}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    const anchor = clicked[0];
    expect(anchor?.download).toBe('la-veilleuse-300_2026-09-04_21h12.json');
    expect(anchor?.href).toBe('blob:lva/export');
    expect(anchor?.isConnected).toBe(false);
    expect(document.body.querySelector('a')).toBeNull();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lva/export');
  });

  it('révoque l’URL même si le clic lève', () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:lva/fail', revokeObjectURL }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('clic refusé');
    });

    expect(() => {
      triggerDownload('x.json', '{}');
    }).toThrow('clic refusé');
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lva/fail');
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('ne fait rien si createObjectURL est indisponible', () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: undefined }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    triggerDownload('x.json', '{}');
    expect(click).not.toHaveBeenCalled();
  });
});
