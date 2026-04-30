<?php

require_once "SatClient.php";
require __DIR__ . "/vendor/autoload.php";

use PhpCfdi\SatWsDescargaMasiva\Services\Query\QueryParameters;
use PhpCfdi\SatWsDescargaMasiva\Shared\DateTimePeriod;
use PhpCfdi\SatWsDescargaMasiva\Shared\RequestType;
use PhpCfdi\SatWsDescargaMasiva\Shared\DownloadType;
use PhpCfdi\SatWsDescargaMasiva\Shared\DocumentStatus;

/**
 * Gestor de configuración (Manual vs Automático)
 */
class ConfigurationManager
{
    private string $mode; // 'auto' or 'manual'
    private ?array $manualRfcs = null;
    private ?DateTime $manualDateFrom = null;
    private ?DateTime $manualDateTo = null;
    private bool $isCliMode = false;

    public function __construct()
    {
        $this->isCliMode = php_sapi_name() === 'cli';
        $this->parseInput();
    }

    private function parseInput(): void
    {
        if ($this->isCliMode) {
            $this->parseCliInput();
        } else {
            $this->parseWebInput();
        }
    }

    private function parseCliInput(): void
    {
        global $argc, $argv;

        $this->mode = 'auto'; // Por defecto

        for ($i = 1; $i < $argc; $i++) {
            $arg = $argv[$i];

            if (strpos($arg, '--mode=') === 0) {
                $this->mode = substr($arg, 7);
            } elseif (strpos($arg, '--rfc=') === 0) {
                $rfc = substr($arg, 6);
                $this->manualRfcs = explode(',', $rfc);
                $this->manualRfcs = array_map('trim', $this->manualRfcs);
            } elseif (strpos($arg, '--from=') === 0) {
                $this->manualDateFrom = new DateTime(substr($arg, 7));
            } elseif (strpos($arg, '--to=') === 0) {
                $this->manualDateTo = new DateTime(substr($arg, 5));
            }
        }

        $this->validateManualMode();
    }

    private function parseWebInput(): void
    {
        $this->mode = $_GET['mode'] ?? 'auto';

        if ($this->mode === 'manual') {
            $rfc = $_GET['rfc'] ?? null;
            if ($rfc) {
                $this->manualRfcs = explode(',', $rfc);
                $this->manualRfcs = array_map('trim', $this->manualRfcs);
            }

            $from = $_GET['from'] ?? null;
            if ($from) {
                $this->manualDateFrom = new DateTime($from);
            }

            $to = $_GET['to'] ?? null;
            if ($to) {
                $this->manualDateTo = new DateTime($to);
            }
        }

        $this->validateManualMode();
    }

    private function validateManualMode(): void
    {
        if ($this->mode === 'manual') {
            if (!$this->manualRfcs || !$this->manualDateFrom || !$this->manualDateTo) {
                throw new Exception(
                    "Modo MANUAL requiere: --rfc=RFC1,RFC2 --from=YYYY-MM-DD --to=YYYY-MM-DD"
                );
            }

            if ($this->manualDateFrom > $this->manualDateTo) {
                throw new Exception("Fecha FROM no puede ser mayor a fecha TO");
            }
        }
    }

    public function getMode(): string
    {
        return $this->mode;
    }

    public function isManual(): bool
    {
        return $this->mode === 'manual';
    }

    public function getManualRfcs(): ?array
    {
        return $this->manualRfcs;
    }

    public function getManualDateFrom(): ?DateTime
    {
        return $this->manualDateFrom;
    }

    public function getManualDateTo(): ?DateTime
    {
        return $this->manualDateTo;
    }

    public function printUsage(): void
    {
        echo "\n═══════════════════════════════════════════════════════════\n";
        echo "MODO DE USO - REQUESTER WS CFDI\n";
        echo "═══════════════════════════════════════════════════════════\n\n";

        echo "🔵 MODO AUTOMÁTICO (por defecto):\n";
        echo "   Procesa todos los RFCs activos del año en curso por semanas\n";
        echo "   $ php cron_ws_create_requests.php\n";
        echo "   $ php cron_ws_create_requests.php --mode=auto\n\n";

        echo "🟡 MODO MANUAL:\n";
        echo "   Procesa RFCs específicos en fechas específicas\n";
        echo "   $ php cron_ws_create_requests.php --mode=manual --rfc=RFC1,RFC2 \\\n";
        echo "     --from=2026-01-01 --to=2026-01-31\n\n";

        echo "Parámetros:\n";
        echo "   --mode=auto|manual     Modo de ejecución (defecto: auto)\n";
        echo "   --rfc=RFC1,RFC2,...    RFCs a procesar (requerido en manual)\n";
        echo "   --from=YYYY-MM-DD      Fecha inicio (requerido en manual)\n";
        echo "   --to=YYYY-MM-DD        Fecha fin (requerido en manual)\n\n";

        echo "Ejemplos:\n";
        echo "   # Automático indefinido\n";
        echo "   $ php cron_ws_create_requests.php\n\n";

        echo "   # Manual: Un RFC, enero 2026\n";
        echo "   $ php cron_ws_create_requests.php --mode=manual \\\n";
        echo "     --rfc=AAAD450324QH1 --from=2026-01-01 --to=2026-01-31\n\n";

        echo "   # Manual: Múltiples RFCs, rango específico\n";
        echo "   $ php cron_ws_create_requests.php --mode=manual \\\n";
        echo "     --rfc=RFC1,RFC2,RFC3 --from=2026-03-01 --to=2026-03-07\n\n";

        echo "═══════════════════════════════════════════════════════════\n\n";
    }
}

/**
 * Gestor de conexión a base de datos para solicitudes
 */
class CreateRequestDatabaseManager
{
    private PDO $connection;
    private PDO $azureConnection;

    public function __construct()
    {
        // PostgreSQL local - solicitudes SAT
        $this->connection = new PDO(
            "pgsql:host=localhost;dbname=mmendoza_db",
            "mmendoza",
            "pato0102"
        );
        $this->connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Azure SQL Server - tabla EFIELES
        $this->azureConnection = new PDO(
            "sqlsrv:Server=mmendoza-server.database.windows.net,1433;Database=mmendoza-database;Encrypt=yes;TrustServerCertificate=no",
            "mmendoza-server-admin",
            "P@to0102"
        );
        $this->azureConnection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    }

    public function getActiveRfcs(): array
    {
        $sql = '
            SELECT c.rfc
            FROM clientes c
            LEFT JOIN cfdi_webservice_progress p ON p.rfc = c.rfc
            WHERE c."syncPaused" = FALSE
              AND c."syncStatus" = \'activo\'
        ';
        return $this->connection->query($sql)->fetchAll(PDO::FETCH_COLUMN);
    }

    public function getProgress(string $rfc): array
    {
        $stmt = $this->connection->prepare("SELECT * FROM cfdi_webservice_progress WHERE rfc = ?");
        $stmt->execute([$rfc]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            return $row;
        }

        return $this->createNewProgress($rfc);
    }

    private function createNewProgress(string $rfc): array
    {
        // Comenzar desde el 01/01 del año en curso
        $year = (new DateTime())->format("Y");
        $startFrom = "$year-01-01";

        $insert = $this->connection->prepare("
            INSERT INTO cfdi_webservice_progress (rfc, current_from, current_to, status)
            VALUES (?, ?, ?, 'idle')
            RETURNING *
        ");

        $start = new DateTime($startFrom);
        $end = (clone $start)->modify("+6 days");

        $insert->execute([$rfc, $start->format("Y-m-d"), $end->format("Y-m-d")]);

        return $insert->fetch(PDO::FETCH_ASSOC);
    }


    public function insertRequest(string $rfc, string $dateFrom, string $dateTo, string $requestId, string $type): void
    {
        $stmt = $this->connection->prepare("
            INSERT INTO cfdi_webservice_requests
            (rfc, date_from, date_to, request_id, tipo, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        ");
        $stmt->execute([$rfc, $dateFrom, $dateTo, $requestId, $type]);
    }

    public function updateDailyLastDate(string $rfc, string $date): void
    {
        $this->connection->prepare("
            UPDATE cfdi_webservice_progress
            SET ws_daily_last_date = ?
            WHERE rfc = ?
        ")->execute([$date, $rfc]);
    }

    public function updateProgress(string $rfc, string $currentFrom, string $currentTo): void
    {
        $update = $this->connection->prepare("
            UPDATE cfdi_webservice_progress
            SET current_from = ?, current_to = ?, status = 'running', updated_at = NOW()
            WHERE rfc = ?
        ");
        $update->execute([$currentFrom, $currentTo, $rfc]);
    }

    /**
     * Obtiene todos los RFCs de EFIELES con su last_update (Azure SQL)
     */
    public function getRfcsFromEfieles(): array
    {
        return $this->azureConnection
            ->query('SELECT rfc, last_update FROM dbo.EFIELES')
            ->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Actualiza last_update al límite real descargado para un RFC en EFIELES (Azure SQL)
     */
    public function updateEfielesLastUpdate(string $rfc, string $date): void
    {
        $stmt = $this->azureConnection->prepare(
            'UPDATE dbo.EFIELES SET last_update = ? WHERE rfc = ?'
        );
        $stmt->execute([$date, $rfc]);
    }
}

/**
 * Calculador de rangos de fecha basado en lógica histórica/diaria
 */
class ProgressCalculator
{
    private DateTime $antier;
    private ?DateTime $manualDateLimit;

    public function __construct(string $rfc, CreateRequestDatabaseManager $db, ?DateTime $manualDateLimit = null)
    {
        $this->antier = (new DateTime())->modify("-2 days")->setTime(0, 0, 0);
        $this->manualDateLimit = $manualDateLimit;
    }

    public function isHistoricalDone(DateTime $currentTo): bool
    {
        $limit = $this->manualDateLimit ?? $this->antier;
        return $currentTo >= $limit;
    }

    public function isCurrentUpToDate(DateTime $currentFrom): bool
    {
        $limit = $this->manualDateLimit ?? $this->antier;
        return $currentFrom > $limit;
    }

    public function calculateEffectiveRange(DateTime $currentFrom, DateTime $currentTo, bool $historicalDone): array
    {
        if ($historicalDone) {
            return $this->calculateDailyRange($currentFrom, $currentTo);
        }

        return $this->calculateHistoricalRange($currentFrom, $currentTo);
    }

    private function calculateDailyRange(DateTime $currentFrom, DateTime $currentTo): array
    {
        $newFrom = (clone $currentTo)->modify("+1 day");
        $newTo = $this->manualDateLimit ?? clone $this->antier;

        return [
            'from' => $newFrom,
            'to' => $newTo,
            'isValid' => $newFrom <= $newTo,
        ];
    }

    private function calculateHistoricalRange(DateTime $currentFrom, DateTime $currentTo): array
    {
        $limitTo = $this->manualDateLimit ?? clone $this->antier;

        if ($currentTo > $limitTo) {
            $currentTo = clone $limitTo;
        }

        return [
            'from' => $currentFrom,
            'to' => $currentTo,
            'isValid' => true,
        ];
    }

    public function calculateNextHistoricalRange(DateTime $currentTo): array
    {
        $newFrom = (clone $currentTo)->modify("+1 day");
        $newTo = (clone $newFrom)->modify("+6 days");

        $upperLimit = $this->manualDateLimit ?? clone $this->antier;

        if ($newTo > $upperLimit) {
            $newTo = clone $upperLimit;
        }

        $isHistoricalDone = $newFrom >= $upperLimit;

        return [
            'from' => $newFrom,
            'to' => $newTo,
            'isHistoricalDone' => $isHistoricalDone,
        ];
    }

    public function getAntier(): DateTime
    {
        return $this->antier;
    }
}

/**
 * Creador de solicitudes SAT
 */
class SatRequestCreator
{
    private \PhpCfdi\SatWsDescargaMasiva\Service $service;
    private CreateRequestDatabaseManager $db;

    public function __construct(string $rfc, CreateRequestDatabaseManager $db)
    {
        $client = new SatClient($rfc);
        $this->service = $client->getService();
        $this->db = $db;
    }

    public function createIssuedRequest(string $rfc, DateTime $from, DateTime $to): bool
    {
        $params = QueryParameters::create(
            DateTimePeriod::createFromValues(
                $from->format("Y-m-d 00:00:00"),
                $to->format("Y-m-d 23:59:59")
            )
        )
        ->withDownloadType(DownloadType::issued())
        ->withRequestType(RequestType::xml())
        ->withDocumentStatus(DocumentStatus::undefined());

        $query = $this->service->query($params);

        if ($query->getStatus()->isAccepted()) {
            $requestId = $query->getRequestId();
            echo "✅ Solicitud emitidos generada: $requestId\n";

            $this->db->insertRequest(
                $rfc,
                $from->format("Y-m-d"),
                $to->format("Y-m-d"),
                $requestId,
                'emitidos'
            );

            $this->db->updateDailyLastDate($rfc, $to->format('Y-m-d'));
            echo "📌 ws_daily_last_date actualizado → {$to->format('Y-m-d')}\n";

            return true;
        }

        echo "❌ Error en emitidos: " . $query->getStatus()->getMessage() . "\n";
        return false;
    }

    public function createReceivedRequest(string $rfc, DateTime $from, DateTime $to): bool
    {
        $params = QueryParameters::create(
            DateTimePeriod::createFromValues(
                $from->format("Y-m-d 00:00:00"),
                $to->format("Y-m-d 23:59:59")
            )
        )
        ->withDownloadType(DownloadType::received())
        ->withRequestType(RequestType::xml())
        ->withDocumentStatus(DocumentStatus::active());

        $query = $this->service->query($params);

        if ($query->getStatus()->isAccepted()) {
            $requestId = $query->getRequestId();
            echo "✅ Solicitud recibidos generada: $requestId\n";

            $this->db->insertRequest(
                $rfc,
                $from->format("Y-m-d"),
                $to->format("Y-m-d"),
                $requestId,
                'recibidos'
            );

            $this->db->updateDailyLastDate($rfc, $to->format('Y-m-d'));
            echo "📌 ws_daily_last_date actualizado → {$to->format('Y-m-d')}\n";

            return true;
        }

        $message = $query->getStatus()->getMessage();
        if (str_contains($message, "cancelados")) {
            echo "⚠ SAT bloqueó recibidos porque hay cancelados → se ignoran.\n";
        } else {
            echo "❌ Error en recibidos: $message\n";
        }

        return false;
    }
}

/**
 * Procesador de solicitudes
 */
class RequestProcessor
{
    private CreateRequestDatabaseManager $db;
    private bool $isManualMode;
    private ?DateTime $manualDateFrom;
    private ?DateTime $manualDateTo;

    public function __construct(bool $isManualMode = false,  ?DateTime $manualDateFrom = null, ?DateTime $manualDateTo = null)
    {
        $this->db = new CreateRequestDatabaseManager();
        $this->isManualMode = $isManualMode;
        $this->manualDateFrom = $manualDateFrom;
        $this->manualDateTo = $manualDateTo;
    }

    /**
     * Procesa un RFC en un rango fijo de fechas (semana por semana)
     * Usado por el modo automático con EFIELES.last_update
     */
    public function processRfcWithRange(string $rfc, DateTime $from, DateTime $to): void
    {
        echo "\n📌 Procesando RFC: $rfc\n";
        echo "⏳ Rango: {$from->format('Y-m-d')} → {$to->format('Y-m-d')}\n";

        try {
            $currentFrom = clone $from;

            while ($currentFrom <= $to) {
                $currentTo = (clone $currentFrom)->modify('+6 days');
                if ($currentTo > $to) {
                    $currentTo = clone $to;
                }

                echo "  📅 Semana: {$currentFrom->format('Y-m-d')} → {$currentTo->format('Y-m-d')}\n";

                $creator = new SatRequestCreator($rfc, $this->db);
                $creator->createIssuedRequest($rfc, $currentFrom, $currentTo);
                $creator->createReceivedRequest($rfc, $currentFrom, $currentTo);

                $currentFrom = (clone $currentTo)->modify('+1 day');
                usleep(400000); // 0.4s para no saturar el SAT
            }

            echo "✔ RFC $rfc procesado\n";
        } catch (Exception $e) {
            echo "⚠ Error con RFC $rfc → " . $e->getMessage() . "\n";
        }
    }

    public function processRfc(string $rfc): void
    {
        echo "\n📌 Procesando RFC: $rfc\n";

        try {

              if ($this->isManualMode) {

                 $currentFrom = clone $this->manualDateFrom;

              while ($currentFrom <= $this->manualDateTo) {

                 $currentTo = (clone $currentFrom)->modify("+6 days");

              if ($currentTo > $this->manualDateTo) {
                 $currentTo = clone $this->manualDateTo;
              }

              echo "⏳ Rango manual: {$currentFrom->format('Y-m-d')} → {$currentTo->format('Y-m-d')}\n";

              $creator = new SatRequestCreator($rfc, $this->db);

              $creator->createIssuedRequest($rfc, $currentFrom, $currentTo);
              $creator->createReceivedRequest($rfc, $currentFrom, $currentTo);

              // avanzar semana
              $currentFrom = (clone $currentTo)->modify("+1 day");

              usleep(400000); // pequeño delay para no saturar SAT
              }

              echo "✔ RFC $rfc procesado completamente en modo manual\n";
              return;
              } else {

              $progress = $this->db->getProgress($rfc);

              $currentFrom = new DateTime($progress["current_from"]);
              $currentTo = new DateTime($progress["current_to"]);
            }

            $calculator = new ProgressCalculator($rfc, $this->db, $this->manualDateTo);

            if ($calculator->isCurrentUpToDate($currentFrom)) {
                echo "✔ RFC $rfc ya está completo hasta el límite\n";
                return;
            }

            $historicalDone = $calculator->isHistoricalDone($currentTo);

            $rangeData = $calculator->calculateEffectiveRange($currentFrom, $currentTo, $historicalDone);

            if (!$rangeData['isValid']) {
                echo "✔ Sin rango nuevo a procesar\n";
                return;
            }

            $rangeFrom = $rangeData['from'];
            $rangeTo = $rangeData['to'];

            $modeLabel = $historicalDone ? "🔵 WS DAILY" : "🟢 WS HISTÓRICO ACTIVO";
            echo "⏳ Rango: {$rangeFrom->format('Y-m-d')} → {$rangeTo->format('Y-m-d')} ($modeLabel)\n";

            $creator = new SatRequestCreator($rfc, $this->db);

            $creator->createIssuedRequest($rfc, $rangeFrom, $rangeTo);
            $creator->createReceivedRequest($rfc, $rangeFrom, $rangeTo);

            if (!$historicalDone && !$this->isManualMode) {
                $nextRange = $calculator->calculateNextHistoricalRange($rangeTo);

                if (!$nextRange['isHistoricalDone']) {
                    $this->db->updateProgress(
                        $rfc,
                        $nextRange['from']->format("Y-m-d"),
                        $nextRange['to']->format("Y-m-d")
                    );
                    echo "➡ Avanzando histórico: {$nextRange['from']->format('Y-m-d')} → {$nextRange['to']->format('Y-m-d')}\n";
                } else {
                    echo "🟡 Histórico WS terminado para RFC $rfc\n";
                }
            } else {
                echo "🔵 WS DAILY/MANUAL ejecutado\n";
            }
        } catch (Exception $e) {
            echo "⚠ Error con RFC $rfc → " . $e->getMessage() . "\n";
        }
    }
}

/**
 * ========================================
 * PUNTO DE ENTRADA DEL SCRIPT
 * ========================================
 */

try {
    $config = new ConfigurationManager();
} catch (Exception $e) {
    echo "❌ Error de configuración: " . $e->getMessage() . "\n";
    $config = new ConfigurationManager();
    $config->printUsage();
    exit(1);
}

// Mostrar modo actual
echo "\n═══════════════════════════════════════════════════════════\n";
echo "🚀 REQUESTER WS CFDI - MODO: " . strtoupper($config->getMode()) . "\n";
echo "═══════════════════════════════════════════════════════════\n\n";

if ($config->isManual()) {
    // ========================================
    // MODO MANUAL
    // ========================================
    $rfcs = $config->getManualRfcs();
    $dateFrom = $config->getManualDateFrom();
    $dateTo = $config->getManualDateTo();

    echo "📋 MODO MANUAL\n";
    echo "   RFCs: " . implode(', ', $rfcs) . "\n";
    echo "   Rango: {$dateFrom->format('Y-m-d')} → {$dateTo->format('Y-m-d')}\n";
    echo "   Procesando por semanas...\n\n";

    $processor = new RequestProcessor(true, $dateFrom, $dateTo);

    foreach ($rfcs as $rfc) {
        $processor->processRfc($rfc);
        usleep(300000); // 0.3 segundos
    }

    echo "\n✔ Procesamiento manual completado.\n";

} else {
    // ========================================
    // MODO AUTOMÁTICO — usa EFIELES.last_update
    // ========================================
    echo "🔄 MODO AUTOMÁTICO (basado en EFIELES.last_update)\n";
    echo "   last_update = NULL  → solicita desde 2021-01-01 hasta hace 3 días\n";
    echo "   last_update = fecha → solicita desde esa fecha hasta hace 3 días\n";
    echo "   Ciclo infinito con intervalo de 30 segundos\n\n";

    $processor = new RequestProcessor(false);

    while (true) {
        echo "\n▶ Ejecutando requester a las " . date("Y-m-d H:i:s") . "\n";

        $db = new CreateRequestDatabaseManager();
        $rows = $db->getRfcsFromEfieles();

        echo "🔍 RFCs en EFIELES: " . count($rows) . "\n";

        // Límite fijo: hace 2 días a medianoche (anteayer)
        $limite = (new DateTime())->modify('-2 days')->setTime(0, 0, 0);

        foreach ($rows as $row) {
            $rfc        = $row['rfc'];
            $lastUpdate = $row['last_update'];

            // $from = día siguiente al último descargado (last_update es inclusivo)
            $from = $lastUpdate
                ? (new DateTime($lastUpdate))->modify('+1 day')->setTime(0, 0, 0)
                : new DateTime('2021-01-01');

            // Si el siguiente día a descargar ya supera el límite, no hay nada nuevo
            if ($from > $limite) {
                echo "✔ RFC $rfc ya está al día (last_update: {$from->format('Y-m-d')})\n";
                continue;
            }

            $processor->processRfcWithRange($rfc, $from, $limite);

            // Guardar el límite real descargado; el próximo ciclo arranca desde aquí sin gaps
            $db->updateEfielesLastUpdate($rfc, $limite->format('Y-m-d'));
            echo "📌 last_update de $rfc actualizado → {$limite->format('Y-m-d')}\n";

            usleep(300000); // 0.3s entre RFCs
        }

        echo "\n✔ Ciclo completado. Esperando 30 segundos...\n";
        sleep(30);
    }
}