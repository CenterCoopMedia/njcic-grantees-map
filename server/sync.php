<?php
/**
 * NJCIC Grantees Map - Airtable sync
 *
 * Deploy to /public_html/map/sync.php. Fetches the MAP VIEW of the
 * "Grants to date" Airtable table and writes data/grantees.json.
 *
 *   https://njcivicinfo.org/map/sync.php?key=SECRET          run the sync
 *   https://njcivicinfo.org/map/sync.php?key=SECRET&debug=1  also print field names + sample
 *
 * Mirrors scripts/sync-airtable.js; keep the two in step.
 *
 * SECRETS: fill in the two values below on the SERVER copy only (copy them
 * from the old sync.php), or put them in sync-config.php next to this file:
 *     <?php return ['airtable_pat' => 'pat...', 'sync_key' => '...'];
 * Never commit real values to GitHub.
 */

$config = is_file(__DIR__ . '/sync-config.php') ? (require __DIR__ . '/sync-config.php') : [];

define('AIRTABLE_PAT', $config['airtable_pat'] ?? 'PASTE_AIRTABLE_PAT_HERE');
define('SYNC_KEY',     $config['sync_key']     ?? 'PASTE_SECRET_SYNC_KEY_HERE');

define('AIRTABLE_BASE_ID',  'appryDZWgPpP0GmZw');
define('AIRTABLE_TABLE_ID', 'tblFADXYCq495smGH');
define('AIRTABLE_VIEW_ID',  'viwjXro41ehrvxTfs');   // MAP VIEW; '' for every record
define('OUTPUT_FILE', __DIR__ . '/data/grantees.json');
define('OFFICIAL_TOTAL_FUNDING', 11880438);

// Airtable field names. (optional) fields are used when present.
const F_GRANTEE        = 'Grantee';
const F_PROJECT        = 'Project Name';
const F_TOTAL          = 'Total Awarded';
const F_YEARS          = 'Year(s) granted:';
const F_FOCUS_AREA     = 'Focus area';
const F_SERVICE_AREA   = 'Service area';
const F_COUNTY         = 'County';
const F_MUNICIPALITIES = 'Municipalities';
const F_WEBSITE        = 'Grantee website';
const F_LAT            = 'Lat';
const F_LNG            = 'Long';
const F_CURRENT        = 'Current';
const F_PRESS_FORWARD  = 'Press Forward Grant?';
const F_GRANT_PURPOSE  = 'Grant purpose';              // (optional) popup description
const F_CITY           = 'City';                       // (optional) preferred over Municipalities
const F_NEW_ORG        = 'New org?';                   // (optional)
const F_CANCELLED      = 'Returned/Cancelled grant?';  // (optional) excluded when checked

const DEFAULT_COORDS = [
    'Atlantic County'   => [39.3643, -74.4229, 'Atlantic City'],
    'Bergen County'     => [40.8859, -74.0435, 'Hackensack'],
    'Burlington County' => [39.9929, -74.7877, 'Mount Holly'],
    'Camden County'     => [39.9259, -75.1196, 'Camden'],
    'Cape May County'   => [38.9351, -74.9060, 'Cape May'],
    'Cumberland County' => [39.4273, -75.2341, 'Bridgeton'],
    'Essex County'      => [40.7357, -74.1724, 'Newark'],
    'Gloucester County' => [39.7029, -75.1118, 'Woodbury'],
    'Hudson County'     => [40.7178, -74.0431, 'Jersey City'],
    'Hunterdon County'  => [40.5123, -74.8582, 'Flemington'],
    'Mercer County'     => [40.2206, -74.7597, 'Trenton'],
    'Middlesex County'  => [40.4922, -74.4513, 'New Brunswick'],
    'Monmouth County'   => [40.2604, -74.2727, 'Freehold'],
    'Morris County'     => [40.7968, -74.4815, 'Morristown'],
    'Ocean County'      => [39.9526, -74.1937, 'Toms River'],
    'Passaic County'    => [40.9168, -74.1718, 'Paterson'],
    'Salem County'      => [39.5687, -75.4671, 'Salem'],
    'Somerset County'   => [40.5693, -74.6094, 'Somerville'],
    'Sussex County'     => [41.0581, -74.7524, 'Newton'],
    'Union County'      => [40.6660, -74.2009, 'Elizabeth'],
    'Warren County'     => [40.8293, -75.0371, 'Belvidere'],
    'Statewide'         => [40.2206, -74.7597, 'Trenton'],
    'North Jersey'      => [40.7357, -74.1724, 'Newark'],
    'Central Jersey'    => [40.4922, -74.4513, 'New Brunswick'],
    'South Jersey'      => [39.9259, -75.1196, 'Camden'],
];

// ---------------------------------------------------------------------------
// Value helpers (mirror scripts/sync-airtable.js)
// ---------------------------------------------------------------------------

function str($v) {
    if (is_array($v)) return implode(', ', array_values(array_filter(array_map('str', $v), 'strlen')));
    if ($v === null || is_bool($v)) return '';
    return trim(preg_replace('/\s+/u', ' ', (string)$v));
}

function is_truthy($v) {
    if (is_array($v)) { foreach ($v as $x) if (is_truthy($x)) return true; return false; }
    if (is_bool($v)) return $v;
    if (is_int($v) || is_float($v)) return $v > 0;
    if (is_string($v)) return in_array(strtolower(trim($v)), ['yes', 'y', 'true', '1', 'current', 'checked', 'x'], true);
    return false;
}

function to_money($v) {
    if (is_int($v) || is_float($v)) return round($v, 2);
    $n = preg_replace('/[^0-9.\-]/', '', str($v));
    return is_numeric($n) ? round((float)$n, 2) : 0.0;
}

function to_coord($v) {
    if (is_int($v) || is_float($v)) return (float)$v;
    $s = str_replace(',', '.', str($v));
    return is_numeric($s) ? (float)$s : null;
}

function to_list($v, $sep = '/[,;]/') {
    $parts = is_array($v) ? $v : preg_split($sep, str($v));
    $out = [];
    foreach ($parts as $p) { $p = str($p); if ($p !== '' && !in_array($p, $out, true)) $out[] = $p; }
    return $out;
}

function sorted_years($list) {
    $years = array_values(array_unique(array_filter(array_map('strval', $list), fn($y) => preg_match('/^\d{4}$/', $y))));
    sort($years, SORT_STRING);
    return $years;
}

function county_key($county) {
    $c = str($county);
    if ($c === '') return '';
    return (preg_match('/county$/i', $c) || isset(DEFAULT_COORDS[$c])) ? $c : "$c County";
}

function describe($purpose) {
    $p = str($purpose);
    if ($p === '') return '';
    return preg_match('/^[a-z]/', $p) ? "Received funding $p" : $p;
}

function status_from_years($years) {
    $cy = (int)date('Y');
    foreach ($years as $y) if ((int)$y >= $cy - 1) return 'active';
    return 'completed';
}

function cents_sum($amounts) {
    $c = 0; foreach ($amounts as $a) $c += (int)round($a * 100); return $c / 100;
}

function money_text($n) {
    return (floor($n) == $n) ? number_format($n, 0) : rtrim(rtrim(number_format($n, 2), '0'), '.');
}

// ---------------------------------------------------------------------------
// Transform (mirror scripts/sync-airtable.js)
// ---------------------------------------------------------------------------

function transform_records(array $records) {
    $groups = [];

    foreach ($records as $record) {
        $f = $record['fields'] ?? [];
        if (is_truthy($f[F_CANCELLED] ?? null)) continue;

        $fullName = str($f[F_GRANTEE] ?? '');
        if ($fullName === '') continue;
        $colon = strpos($fullName, ':');
        $name = $colon !== false ? trim(substr($fullName, 0, $colon)) : $fullName;
        $nameProject = $colon !== false ? trim(substr($fullName, $colon + 1)) : '';

        // Per-year amounts from "Awarded in YEAR" columns
        $awards = [];
        $keys = array_keys($f); sort($keys, SORT_STRING);
        foreach ($keys as $key) {
            if (preg_match('/^Awarded in (\d{4})$/', $key, $m)) {
                $amt = to_money($f[$key]);
                if ($amt) $awards[$m[1]] = $amt;
            }
        }

        $years = sorted_years(to_list($f[F_YEARS] ?? ''));
        if (!$years) { $years = array_map('strval', array_keys($awards)); sort($years, SORT_STRING); }
        $amount = to_money($f[F_TOTAL] ?? '');
        if (!$amount) $amount = cents_sum($awards);
        $focusAreas = to_list($f[F_FOCUS_AREA] ?? '', '/;/');
        $project = str($f[F_PROJECT] ?? '');

        $grant = [
            'projectName'  => $project !== '' ? $project : ($nameProject !== '' ? $nameProject : null),
            'years'        => $years,
            'amount'       => $amount,
            'awardsByYear' => (object)$awards,
            'description'  => describe($f[F_GRANT_PURPOSE] ?? ''),
            'focusArea'    => implode('; ', $focusAreas),
            'status'       => status_from_years($years),
            'isCurrent'    => is_truthy($f[F_CURRENT] ?? null),
            'pressForward' => is_truthy($f[F_PRESS_FORWARD] ?? null),
        ];

        $key = mb_strtolower($name);
        if (!isset($groups[$key])) {
            $groups[$key] = ['name' => $name, 'grants' => [], 'website' => '', 'serviceArea' => '',
                'county' => '', 'lat' => null, 'lng' => null, 'city' => '', 'isNewOrg' => false];
        }
        $g = &$groups[$key];
        $g['grants'][] = $grant;

        $lat = to_coord($f[F_LAT] ?? null);
        $lng = to_coord($f[F_LNG] ?? null);
        if ($g['lat'] === null && $lat !== null && $lng !== null) { $g['lat'] = $lat; $g['lng'] = $lng; }
        if ($g['website'] === '') $g['website'] = str($f[F_WEBSITE] ?? '');
        if ($g['serviceArea'] === '') $g['serviceArea'] = str($f[F_SERVICE_AREA] ?? '');
        if ($g['county'] === '') $g['county'] = str($f[F_COUNTY] ?? '');
        if ($g['city'] === '') {
            $g['city'] = str($f[F_CITY] ?? '');
            if ($g['city'] === '') $g['city'] = to_list($f[F_MUNICIPALITIES] ?? '')[0] ?? '';
        }
        if (is_truthy($f[F_NEW_ORG] ?? null)) $g['isNewOrg'] = true;
        unset($g);   // break the reference before the next loop iteration
    }

    $grantees = [];
    foreach ($groups as $g) {
        $grants = $g['grants'];
        usort($grants, function ($a, $b) {
            if ($a['amount'] != $b['amount']) return $b['amount'] <=> $a['amount'];
            return strcmp(implode(',', $a['years']), implode(',', $b['years']));
        });

        $serviceArea = $g['serviceArea'] !== '' ? $g['serviceArea'] : 'Statewide';
        $lat = $g['lat']; $lng = $g['lng']; $city = $g['city'];
        if ($lat === null || $lng === null) {
            $fb = DEFAULT_COORDS[county_key($g['county'])] ?? DEFAULT_COORDS[$serviceArea] ?? DEFAULT_COORDS['Statewide'];
            [$lat, $lng] = $fb;
            if ($city === '') $city = $fb[2];
        }

        $years = [];
        $focus = [];
        $awards = [];
        $isCurrent = false; $pressForward = false;
        foreach ($grants as $gr) {
            $years = array_merge($years, $gr['years']);
            foreach (to_list($gr['focusArea'], '/;/') as $a) if (!in_array($a, $focus, true)) $focus[] = $a;
            foreach ((array)$gr['awardsByYear'] as $y => $a) $awards[(string)$y] = round(($awards[(string)$y] ?? 0) + $a, 2);
            $isCurrent = $isCurrent || $gr['isCurrent'];
            $pressForward = $pressForward || $gr['pressForward'];
        }
        $years = sorted_years($years);
        ksort($awards, SORT_STRING);
        $total = cents_sum(array_column($grants, 'amount'));

        $result = [
            'name'         => $g['name'],
            'county'       => $serviceArea,
            'city'         => $city,
            'years'        => $years,
            'amount'       => $total,
            'lat'          => $lat,
            'lng'          => $lng,
            'status'       => status_from_years($years),
            'isCurrent'    => $isCurrent,
            'isNewOrg'     => $g['isNewOrg'],
            'pressForward' => $pressForward,
            'website'      => $g['website'],
            'focusArea'    => implode('; ', $focus),
            'focusAreas'   => $focus,
            'awardsByYear' => (object)$awards,
        ];

        if (count($grants) > 1) {
            $result['description'] = 'This organization received ' . count($grants) . ' grants totaling $' . money_text($total) . '.';
            $result['grants'] = [];
            foreach ($grants as $i => $gr) $result['grants'][] = ['id' => $i + 1] + $gr;
            $result['totalAmount'] = $total;
            $result['hasMultipleGrants'] = true;
            $result['grantCount'] = count($grants);
        } else {
            $result['projectName'] = $grants[0]['projectName'];
            $result['description'] = $grants[0]['description'];
        }
        $grantees[] = $result;
    }

    usort($grantees, fn($a, $b) => strcmp(mb_strtolower($a['name']), mb_strtolower($b['name'])));
    return $grantees;
}

function build_output(array $grantees, $source) {
    $totalGrants = 0; $current = 0;
    foreach ($grantees as $g) { $totalGrants += $g['grantCount'] ?? 1; if ($g['isCurrent']) $current++; }
    return [
        'grantees' => $grantees,
        'metadata' => [
            'totalGrantees'        => count($grantees),
            'totalFunding'         => cents_sum(array_column($grantees, 'amount')),
            'officialTotalFunding' => OFFICIAL_TOTAL_FUNDING,
            'totalGrants'          => $totalGrants,
            'currentGrantees'      => $current,
            'lastUpdated'          => gmdate('Y-m-d'),
            'dataSource'           => $source,
            'note'                 => 'Data synced from Airtable. Organizations with multiple grants are consolidated.',
        ],
    ];
}

// ---------------------------------------------------------------------------
// Airtable fetch
// ---------------------------------------------------------------------------

function fetch_all_records() {
    $records = [];
    $offset = null;
    do {
        $params = ['pageSize' => 100];
        if (AIRTABLE_VIEW_ID !== '') $params['view'] = AIRTABLE_VIEW_ID;
        if ($offset) $params['offset'] = $offset;
        $url = 'https://api.airtable.com/v0/' . AIRTABLE_BASE_ID . '/' . AIRTABLE_TABLE_ID . '?' . http_build_query($params);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . AIRTABLE_PAT],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($body === false) throw new RuntimeException("Airtable request failed: $err");
        if ($code !== 200) throw new RuntimeException("Airtable HTTP $code: " . substr($body, 0, 300));
        $page = json_decode($body, true);
        if (!is_array($page) || !isset($page['records'])) throw new RuntimeException('Unexpected Airtable response');

        $records = array_merge($records, $page['records']);
        $offset = $page['offset'] ?? null;
    } while ($offset);
    return $records;
}

function write_json_atomically($path, array $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false) throw new RuntimeException('JSON encode failed: ' . json_last_error_msg());
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    // Preferred: write a temp file in the same folder, then swap it in, so the
    // map never reads a half-written file. Needs write permission on the folder.
    if (is_writable($dir)) {
        if (is_file($path)) @copy($path, $path . '.bak');      // keep the previous version
        $tmp = $path . '.tmp';
        if (@file_put_contents($tmp, $json, LOCK_EX) !== false && @rename($tmp, $path)) return 'replaced';
        @unlink($tmp);
    }

    // Fallback: overwrite the existing file in place. Needs write permission
    // on grantees.json only (not on the folder).
    if (is_file($path) && is_writable($path) && @file_put_contents($path, $json, LOCK_EX) !== false) {
        return 'overwritten in place';
    }

    $who = function_exists('posix_geteuid') && function_exists('posix_getpwuid')
        ? (posix_getpwuid(posix_geteuid())['name'] ?? posix_geteuid()) : get_current_user();
    throw new RuntimeException(
        "Cannot write $path. The web server (running as \"$who\") needs write permission on the " .
        "data folder (" . (is_writable($dir) ? 'writable' : 'NOT writable') . ") or on grantees.json (" .
        (is_file($path) ? (is_writable($path) ? 'writable' : 'NOT writable') : 'missing') . "). " .
        "In FileZilla: right-click the data folder > File permissions > 775 (or 777), and grantees.json > 664 (or 666)."
    );
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

// CLI test mode: php sync.php --records records.json --out out.json
if (PHP_SAPI === 'cli') {
    $opts = getopt('', ['records:', 'out:']);
    if (!isset($opts['records'], $opts['out'])) { fwrite(STDERR, "Usage: php sync.php --records records.json --out out.json\n"); exit(1); }
    $records = json_decode(file_get_contents($opts['records']), true)['records'] ?? [];
    $out = build_output(transform_records($records), 'CLI test');
    file_put_contents($opts['out'], json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    echo "Wrote {$out['metadata']['totalGrantees']} grantees to {$opts['out']}\n";
    exit(0);
}

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

if (!hash_equals(SYNC_KEY, (string)($_GET['key'] ?? '')) || SYNC_KEY === 'PASTE_SECRET_SYNC_KEY_HERE') {
    http_response_code(403);
    exit("Forbidden\n");
}

try {
    $records = fetch_all_records();
    if (!$records) throw new RuntimeException('Airtable returned 0 records; keeping the existing grantees.json');

    $grantees = transform_records($records);
    if (!$grantees) throw new RuntimeException('No grantees produced; keeping the existing grantees.json');

    $output = build_output($grantees, 'Airtable - Grants to date: NJ Civic Info Consortium');
    $how = write_json_atomically(OUTPUT_FILE, $output);

    $m = $output['metadata'];
    echo "Sync complete\n";
    echo "Records: " . count($records) . "\n";
    echo "Grantees: {$m['totalGrantees']} | Grants: {$m['totalGrants']} | Current: {$m['currentGrantees']}\n";
    echo "Funding: $" . number_format($m['totalFunding'], 2) . "\n";
    echo "Updated: {$m['lastUpdated']}\n";
    echo "File: data/grantees.json ($how)\n";

    if (!empty($_GET['debug'])) {
        $names = [];
        foreach ($records as $r) $names = array_merge($names, array_keys($r['fields'] ?? []));
        $names = array_values(array_unique($names)); sort($names);
        echo "\nFields seen: " . implode(' | ', $names) . "\n";
        echo "\nFirst grantee:\n" . json_encode($grantees[0], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo "Sync failed: " . $e->getMessage() . "\n";
}
