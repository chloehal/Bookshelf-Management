<?php
require __DIR__.'/../api/catalog-editions.php';
function check_editions($ok, $label) { if (!$ok) throw new Exception($label); }
$bnfXml = file_get_contents(__DIR__.'/fixtures/bnf-lux.xml');
$bnf = catalog_editions_sru($bnfXml, 'bnf', 0);
check_editions(count($bnf['items']) === 1 && $bnf['next_offset'] === null, 'Parse BnF edition page and total');
$sudocRecord = file_get_contents(__DIR__.'/fixtures/sudoc-daraya.xml');
$sudocXml = '<response><numberOfRecords>21</numberOfRecords><recordData>'.$sudocRecord.'</recordData></response>';
$sudocXml = str_replace('<?xml version="1.0" encoding="UTF-8"?>', '', $sudocXml);
$sudoc = catalog_editions_sru($sudocXml, 'sudoc', 0);
check_editions($sudoc['items'][0]['source_id'] === '292390726' && $sudoc['next_offset'] === 1, 'Parse Sudoc SRU embedded record and pagination');
$books = ['bnf'=>$bnf['items'][0], 'sudoc'=>$sudoc['items'][0], 'openlibrary'=>['source_id'=>'OL1M','lookup_source'=>'openlibrary','title'=>'Lux']];
$calls = [];
$providers = [];
foreach ($books as $source=>$book) $providers[$source] = function($query, $offset) use ($source,$book,&$calls) {
    $calls[$source] = $offset;
    return ['items'=>[$book], 'total'=>21, 'next_offset'=>$offset === 0 ? 20 : null];
};
$first = catalog_editions(['title'=>'Lux','author'=>'Maxime Chattam'], $providers);
check_editions(count($first['items']) === 3 && count($calls) === 3, 'Query all three sources, not first-hit fallback');
check_editions($first['next']['bnf_offset'] === 20 && $first['next']['sudoc_offset'] === 20, 'Keep independent pagination cursors');
$next = catalog_editions($first['next'], $providers);
check_editions($next['next'] === null && $calls['bnf'] === 20, 'Last page exhausts sources');
$providers['bnf'] = function(){throw new RuntimeException('Offline');};
$partial = catalog_editions(['title'=>'Lux'], $providers);
check_editions(count($partial['items']) === 2 && count($partial['warnings']) === 1 && $partial['next']['bnf_offset'] === 0, 'Partial outage keeps good results and retry cursor');
foreach ($providers as $key=>$_) $providers[$key] = function(){throw new RuntimeException('Offline');};
try { catalog_editions(['title'=>'Lux'], $providers); throw new Exception('All outages hidden'); } catch(RuntimeException $e) {}
try { catalog_editions(['title'=>'Lux','bnf_offset'=>'oops'], $providers); throw new Exception('Invalid cursor accepted'); } catch(InvalidArgumentException $e) {}
check_editions(catalog_cql_text('" x \\ y') === 'x y', 'CQL text cannot inject operators or quotes');
$successDiagnostic = str_replace('</response>', '<diagnostics><uri>info:srw/diagnostic/1/0</uri></diagnostics></response>', $sudocXml);
check_editions(count(catalog_editions_sru($successDiagnostic, 'sudoc', 0)['items']) === 1, 'Sudoc success diagnostic zero is not an error');
$nextPosition = str_replace('</response>', '<nextRecordPosition>3</nextRecordPosition></response>', $sudocXml);
check_editions(catalog_editions_sru($nextPosition, 'sudoc', 0)['next_offset'] === 2, 'Use provider nextRecordPosition without skipping a short page');
echo "Edition catalogue tests passed\n";
