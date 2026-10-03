export function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="flex-auto w-full bg-blue-200 rounded p-1 print:hidden" role="status" data-testid="update-banner">
      <span>Nova versão disponível</span>{' '}
      <button className="bg-gray-300 rounded-xl px-2" onClick={onUpdate} data-testid="update-button">
        Atualizar
      </button>
    </div>
  );
}

export function DataUpdatedBanner() {
  return (
    <div className="flex-auto w-full bg-blue-200 rounded p-1 print:hidden" role="status" data-testid="data-updated-banner">
      Dados de referência atualizados — aplicam-se no próximo caso
    </div>
  );
}

export function DataUnavailableBanner() {
  return (
    <div className="flex-auto w-full bg-red-200 rounded p-1" role="alert" data-testid="data-unavailable">
      Dados de referência indisponíveis — ligue-se à internet uma vez
    </div>
  );
}
