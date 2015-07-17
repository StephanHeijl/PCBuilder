# Tweakers.net PriceWatch API

from mod_python import apache
import json
import traceback
import requests
import os
import re
import collections
from datetime import date, timedelta
from bs4 import BeautifulSoup
from pprint import pformat as pf

def index(req, filter="{}"):
	req.content_type = 'application/json'
	output = {}
	try:
		filters = json.loads(filter)
		if len(filter) == 0:
			raise ValueError, "No filters given."
			
		output["filters"] = filters
		
		req.write( json.dumps(dict( output.items() + {'State':'OK'}.items()) ) );
	except:
		req.write( json.dumps( {'State':'Error',
									'Error': traceback.format_exc() } ) )
								
def errorContainment(func):
	def intercept(*args, **kwargs):
		if len(kwargs) == 0:
			return func(*args,**kwargs)
		
		req = kwargs['req']
		req.content_type = 'application/json'
		try:
			return func(*args,**kwargs)
		except:
			req.status = 500
			req.write( json.dumps( {'State':'Error',
									'Error': traceback.format_exc() } ) )
		
	return intercept

@errorContainment
def results(req, cat, format="table", limit=10, page=1 ,args="undefined"):
	baseUrl = "http://tweakers.net/xmlhttp/xmlHttp.php"
	
	arguments = {	"application":"tweakbase",
					"type":"filter",
					"action":"product",
					"twk": "47-%s" % cat,
					"page":page,
					"pageSize":limit,
					"output":"json",
					"orderField": "popularity",
					"si":1,
				}
				
	args = json.loads(args) if args != "undefined" else {}
	
	if "max-age" in args:
		maxage = args["max-age"]
		del args["max-age"]
		
		d = ( date.today()-timedelta(days=int(maxage) ) )
		arguments["fpti"] = d.strftime("%d-%m-%Y")
		
	if "fpti" not in arguments:	# ftpi can be specified manually	
		d = ( date.today()-timedelta(days=365*2) )
		twoyears = d.strftime("%d-%m-%Y")
		arguments["fpti"] = twoyears
	
	try:
		arguments = dict( arguments.items() + args.items() )
	except:
		pass
		
	
	url = baseUrl + "?" + "&".join(["%s=%s" % (k,v) for k,v in arguments.items()] )
	
	results = parse( url )
	
	if not results:
		# Try again without time and rating limitations
		del arguments["fpti"]
		del arguments["si"]
		url = baseUrl + "?" + "&".join(["%s=%s" % (k,v) for k,v in arguments.items()] )	
		results = parse( url )
		
		if not results:
			req.write(json.dumps({}))
			return
		
	results = results[:int(limit)]
		
	results = sorted(results, key=lambda k: k[-2])
	results.reverse()
	if format == "json":
		req.write( json.dumps( results ) )
		
	elif format == "table":
		req.content_type = "text/html"
		html = "<table><thead><tr>"
		for header in ["Naam", "prijs","score","aantal reviews","ratio","id"]:
			html+="<td>%s</td>" % header
		html+= "</tr></thead><tbody>"		
		
		for r in results[:int(limit)]:
			html +="<tr>"
			for v in r:
				html+="<td>%s</td>" % v
			html +="</tr>"
	
		soup = BeautifulSoup(html)
		req.write(str(soup.prettify()))
								
def parse(url):
	r = requests.get(url)
	data = r.json()
	
	facets = {}
		
	try:
		for facet,value in data['data']['facets'].items():
			cat = str(facet.split("_")[0])		
			id	= str("_".join(facet.split("_")[1:]))
			if cat not in facets:
				facets[cat] = {}
			
			facets[cat][id] = str(value)
	except AttributeError as err:
		return False
	
	queries = {}
	for query,value in data['data']['querystring'].items():
		cat = query.split("_")[0]
		if cat not in queries:
			queries[str(cat)] = str(value)
	
	soup = BeautifulSoup(data['data']['html'])
	
	modelNames = []
	modelIds = []
	url = re.compile("\/pricewatch\/(\d{6})\/")
	for name in filter( lambda m: "specline" not in str(m), soup.select('p.ellipsis')):
		try:
			modelNames.append(name.text)
			modelIds.append(int(re.search(url, list(name.children)[0]['href']).group(1)))
		except:
			modelNames.pop()
			continue
		
	modelPrices = []
	euros = re.compile(". (\d+,(\d+)?)")
	for price in soup.select('p.price a'):
		
		p = re.search( euros, price.text)
		if p:
			p = p.group(1) 
		else:
			continue
			
		if p[-1] == ",":
			p += "00"
		p = float(p.replace(",","."))
		modelPrices.append(p)
		
	modelScores = []
	stars = re.compile("score(\d{2})")
	for score in soup.select("span.scoreStars"):
		foundScore = float(re.search(stars, " ".join(score.get("class")) ).group(1))
		modelScores.append( foundScore/0.5 )
		
		
	modelReviewCount = []
	reviewCount = re.compile("(\d+) review")
	for review in soup.select("p.specline a"):
		if "review" in review.text:
			modelReviewCount.append(int(re.search(reviewCount, review.text).group(1)) )
			
	for s in range(len(modelScores)):
		if modelScores[s] == 0:
			modelReviewCount.insert(s, 0)
			
	modelBangForBuck = []
	for p,s in zip(modelPrices, modelScores):
		modelBangForBuck.append(round(s/p,2))
		
	modelReliableReview = []
	for s, rc in zip(modelScores, modelReviewCount):
		modelReliableReview.append((s**5) * rc)

		
	results = zip(modelNames,modelPrices,modelScores,modelReviewCount,modelBangForBuck,modelReliableReview,modelIds)
	
	sortedResults = sorted(results, key=lambda v: (v[2], v[3], v[4]) )
	sortedResults.reverse()
	
	return sortedResults
	
def parsebbg(req):
	req.content_type="text/plain"
	catUrl = "http://tweakers.net/tag/Best+buy+guide/reviews/" 
	bbgCat = requests.get(catUrl).text
	
	systems = {}
	parts = []
	
	catSoup = BeautifulSoup(bbgCat)
	for bbgUrl in catSoup.select("p.title a")[0:10]:
		bbgUrl = bbgUrl['href']
		date = re.findall( "(\w+-\d+)\.html$", bbgUrl)[0].replace("-", " ").capitalize()
		
		req.write( "Retreiving BBG for %s." % date )
		
		bbg = requests.get(bbgUrl).text
		bbgSoup =  BeautifulSoup(bbg)
		
		for s in bbgSoup.select("tr td a"):
			try:
				budget = int(re.findall("(\d+) euro$", s.parent.find_next('td').text)[0])
				systems["%s - %s" % (s.text,date) ] = {"budget":budget, "url":s['href']}
			except:
				print "Geen budget"
		
		for name in systems:
			url = systems[name]['url']
			systems[name]['parts'] = []
			soup = BeautifulSoup( requests.get(url).text )
			partUrls = soup.select("span.heading a")
			
			for pU in partUrls:
				ids = re.findall("pricewatch/(\d+)", pU['href'])
				if len(ids) > 0 :
					id = ids[0]
					systems[name]['parts'].append(id)
					parts.append(id)
	
	bbg = open(os.path.sep.join((__file__.split(os.path.sep)[:-1])) + "/bbg.json","w")
	bbg_full = open(os.path.sep.join((__file__.split(os.path.sep)[:-1])) + "/full_bbg.json","w")
	json.dump(systems, bbg_full, sort_keys=True)
	parts = list(set(parts))
	json.dump(parts, bbg, sort_keys=True)
	bbg.close()
	bbg_full.close()
	req.write("Finished")	

@errorContainment
def product(req,id,key=None):
	req.content_type = "application/json"
	url = "http://tweakers.net/pricewatch/%s/" % id
	
	redirectPage = requests.get(url).text.encode('utf-8')
	rp = BeautifulSoup(redirectPage)
	specspage = rp.select("a.readMore")[0]['href']
	specs = requests.get(specspage).text.encode('utf-8')

	specsoup = BeautifulSoup(specs)
	names = specsoup.select(".spec-index-column")
	values = specsoup.select(".spec-index-column + .spec-column")
	
	details = dict(([ (n.text,v.text) for n,v in zip(names, values) ]) )
	
	if key and key in details.keys():
		req.write( json.dumps(details[key]))	
	else:
		req.write( json.dumps(details))	

@errorContainment		
def getCategoryFilters(req):
	req.content_type="text/plain"
	baseDir = os.path.sep.join((__file__.split(os.path.sep)[:-1])) 
	cfDir = baseDir + "/categoryfilters/"
	baseUrl = "http://tweakers.net/xmlhttp/xmlHttp.php"
	
	partsFile = open(baseDir + "/onderdelen.json", "r")	
	parts = json.load(partsFile)
	partsFile.close()
	
	arguments = {	"application":"tweakbase",
					"type":"filter",
					"action":"product",
					"twk": "47-0",
					"page":0,
					"pageSize":1,
					"output":"json",
					"orderField": "popularity",
				}
	
	for partId, partDetails in parts.items():
		arguments["twk"] = "47-%s" % partId
		url = baseUrl + "?" + "&".join(["%s=%s" % (k,v) for k,v in arguments.items()] )
		
		r = requests.get(url)
		data = r.json()
		
		facets = {}
		for facet,value in data['data']['facets'].items(): 
			if isinstance(value, float) or isinstance(value, int):
				continue
			
			cat = str(facet.split("_")[0])		
			id	= str("_".join(facet.split("_")[1:-1]))
			
			if cat not in facets:
				facets[cat] = {}
			
			facets[cat][value['v']] = id
		
		partFile = open(cfDir + partDetails["name"] + ".json","w")
		json.dump(facets, partFile)
		partFile.close()
