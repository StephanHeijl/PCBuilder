$(function() {
	
	$("#content").load("start.htm")
	$("#sidebar").load("startmenu.htm")
	
	$("nav li").click(function() {
		$("nav li.on").removeClass("on")
		$(this).addClass("on")
		
		$("#content").load($(this).attr("id") + ".htm")
		$("#sidebar").load($(this).attr("id") + "menu.htm")
		
		$.getJSON($(this).attr("id") + ".json", function(data) {
			for (id in data) {
				el = $("#"+id)
				for( args in data[id] ) {
					el.attr(args, data[id][args])
				}
			}
		});
		
		if ( $(this).attr("id") == "budget" ) {
			restoreBudget();
		}
		
	});
	
	function restoreBudget() {
		
	}	
	
	$("#content").on("change", "input[type=range]", function() {
		adjustProgressToRange($(this));
	});
	
	$("#content").on("keyup", "#total", function() {
		$("#budgetsliders input[type=range]").each(function() {
			adjustProgressToRange($(this))
		});
	});
	
	function adjustProgressToRange(range) {
		range.next().val( range.val() ).addClass("set");
		var euros = Math.round((($("#total").val() * ((range.val())/ 100))*100))/100 + "€"
		range.parent().next().text( euros )
		equalizeProgressBars($("progress"), $("progress").not(range).not("progress.set") );
	}	
	
	$("#content").on("keyup", "input[type=number]", function() {
		equalizeProgressBars( $("progress"), $("progress") );
	});
	
	$("#sidebar").on("click", "#onderdelentonen", function() {
		prijzen = JSON.parse(getSelectedPrices(true))
		
		console.log(prijzen)
		
		$("#content").load("onderdelen.htm")
		$("#sidebar").load("onderdelenmenu.htm", function() {
			$("#sidebar .category").each(function() {
				id = $(this).attr("id")
				console.log(id)
				$(this).attr("args", JSON.stringify(prijzen[id]))
			});	
		});	
	});
	
	function collectParts() {
		var selectedPrices = JSON.parse(getSelectedPrices(true))
		var requestedParts = new Array();
		$.each(selectedPrices, function(k,v) {
			if ( k != "total" && v['pa'] > 0 ) {
				requestedParts.push([k,v]);
			}
		});
		
		
		$.getJSON("onderdelen.json", function(partNames) {
			window.partNames = new Array();
			for ( i in partNames ) {
				var pk = partNames[i]['id'];
				delete partNames[i]['id'];
				window.partNames[pk] = partNames[i];
			}
			
			window.totalPrice = 0;
			window.results = new Array();
			$.ajax({ dataType: "json", url:"categoryfilters/filters.json", async:true, success:function(data) {
				window.availableFilters = data;
			}});
			window.activeFilters = new Array();
			window.waiter = $.Deferred();
			
			getPartsDetails(requestedParts)
			
		});
		
	}
	
	function getPartsDetails( requestedParts ) {
		var requestedPart = requestedParts[0];
		var k = requestedPart[0],
			v = requestedPart[1];
		
		var filterLock = 0;
		if( window.activeFilters.length > 0 ) {
			// console.log(window.activeFilters.length, "filters have been applied")
						
			// Load the filters that are available for this category
			filterLock = $.ajax({ dataType: "json", url:"categoryfilters/"+window.partNames[k]['name']+".json", async:false, success:function(data) {
				
				// console.log(window.partNames[k]['name'], "filters geladen")
				
				for( af in window.activeFilters) {
					var keys = window.activeFilters[af][0],
						value = window.activeFilters[af][1];
					
					
					for(fk in keys) {						
						filterkey = keys[fk];
						if ( filterkey in data ) {
							v[filterkey] = data[filterkey][value]
						}
					}
				}				
			}});		
		}
		
		$.when(filterLock).done(function() {				
			var maxAge = parseInt(window.partNames[k]['max-age']);
			if ( maxAge > 0) {
				v["max-age"] = maxAge;
			}		
			
			var url = "api.py/results?cat="+k+"&format=json&limit=5&args="+JSON.stringify(v)
			$.ajax({ dataType: "json", url:url, async:true, success:function(data) {
				
				if(data[0] != undefined) {
					console.log(data[0])
					results.push(data[0])
					totalPrice += data[0][1]
					$("ul#partsloaded").append("<li>"+window.partNames[k]['name']+"</li>")
				
				
				// Allow for certain filters to be applied
				
					console.log(window.partNames[k])
					
					if( "get" in window.partNames[k] ) {
						var gets = window.partNames[k]["get"];
						
						console.log("This product requires some filters: ",gets)
						
						$.ajax({ dataType: "json", url:"api.py/product?id=" + data[0][6], async:false, success:function(details) {
							$.each(gets, function( detail ) {
								detail = gets[detail];
								window.activeFilters.push([availableFilters[detail], details[detail]])
							});
						}});
					}
					
				} else {
					results.push(["Geen " + window.partNames[k]['name'] + " gevonden.", 0, 0, 0, 0, 0])
				}
				
				
				// Call itself to for the next part
				if( requestedParts.length > 1) {
					getPartsDetails(requestedParts.splice(1));
				} else {
					createPartsTable()
				}
			}});			
		});
	}
		
	function createPartsTable() {
		// Create the results table
		
		console.log("Done")
		
		table = $("<table>")
		table.attr("id", "results")
		head = $("<thead>")
		headtr = $("<tr>")
		
		$.each(["Product", "Beoordeling", "Reviews", "Prijs"], function() {
			td = $("<th>")
			td.text(this);
			td.appendTo(headtr);
		})
		
		headtr.appendTo(head);
		head.appendTo(table);
	
		tableN = createBasicTable(window.results, table)						
		totalPrice = totalPrice.toFixed(2)
		
		totalRow = $("<tr>").addClass("totalRow")
		$("<td>").text("Totaal").appendTo(totalRow)
		$("<td>").appendTo(totalRow)
		$("<td>").appendTo(totalRow)
		$("<td>").text(totalPrice + "€").appendTo(totalRow)
		
		totalRow.appendTo(tableN)
		
		$("#content").html(tableN)
		
	}	
	
	
	$("#sidebar").on("click", "#opstellenstarten", function() {
		$("#content").load("samenstellen.htm")
		collectParts()			
	});
	
	function getSelectedPrices(overwrite) {
		prijzen = {};
		if (!localStorage.getItem("prijzen") || overwrite) {
			prijzen["total"] = $("#total").val()
			$("input[type=range]").each(function() { 
				id = $(this).attr("name")
				actual=parseFloat( $(this).parent().next().text() );
				min=parseFloat( $(this).parent().next().text() )*0.75;
				max=parseFloat( $(this).parent().next().text() )*1.08;
				
				prijzen[id] = {	"pi":Math.round(min*100)/100,
								"pa":Math.round(max*100)/100,
								"value":parseFloat($(this).next().val())};
			});
			localStorage.setItem("prijzen", JSON.stringify(prijzen) )
		}
		return localStorage.getItem("prijzen")
	}
	
	function equalizeProgressBars( progress, progressn ) {
		sum = 0;
		progress.each(function() {
			v = $(this).val()
			sum+=v;
		});
		if (sum != 100) {
			diff = 100-sum;
			part = diff/progress.length
			progressn.each(function() {
				v = $(this).val()
				$(this).val(v+part)
				$(this).parent().next().text( Math.round((($("#total").val() * ((v+part)/ 100))*100))/100 + "€" )
				$(this).parent().children("input[type=range]").val(v+part)
			});
		}
		
		sum = 0;
		progress.each(function() {
			v = $(this).val()
			sum+=v;
		});
		$("#sum td:last").text( Math.round(sum*$("#total").val())/100  +"€" )
		if (sum > 101) {
			$("#sum td:last").css("color", "red");
		} else {
			$("#sum td:last").css("color", "white");
		}
		
	}
	
	$("#sidebar").on("click", ".button.category", function() {
		// Retreive data from Tweakers or local cache
		var cat = $(this).attr("id")
		args = $(this).attr("args")
		
		// Create the table
		table = $("<table>")
		table.attr("id", "results")
		head = $("<thead>")
		headtr = $("<tr>")
		
		$.each(["Product", "Beoordeling", "Reviews", "Prijs", ""], function() {
			td = $("<th>")
			td.text(this);
			td.appendTo(headtr);
		})
		headtr.appendTo(head);
		head.appendTo(table);
		
		// Check if the data is in localStorage, otherwise, retreive it from the api
		if( localStorage.getItem(cat) !== null) {
			data = JSON.parse( localStorage.getItem(cat) )
			createBasicTable(data,table)
			
		} else {
			url = "api.py/results?cat="+cat+"&format=json&limit=20&args="+args
			$.getJSON(url, function(data) {
				createBasicTable(data, table)
				localStorage.setItem(cat, JSON.stringify(data) )
			});			
		}
		
		$("#content").html(table);

		// Handle fullspread interaction
		if($(".fullSpread").length == 0) {
			topButton = $(".button:first")
		} else {
			topButton = 0;
		} 
		
		clickedButton = $(this)
		thisPosition = $("#sidebar .button, #sidebar .fullSpread").index(clickedButton)
		
		if(thisPosition == 0) {
			clickedButton.addClass("fullSpread").removeClass("button")			
			return
		}
		
		$(".fullSpread").addClass("button").removeClass("fullSpread")		
		
		clone = clickedButton.clone()
		clickedButton.animate({"margin-left":-1000},500, function(){
			clone.prependTo("#sidebar")
			clickedButton.remove()
			clone.addClass("fullSpread")
			clone.removeClass("button")
		});
		
		if($(".fullSpread").length == 0 && topButton != 0) {
			topClone = topButton.clone()
			topButton.animate({"margin-left":-1000},500, function(){
				$("#sidebar .button, #sidebar .fullSpread").eq(thisPosition).after( topClone )
				topButton.remove()
			});
		}
	});
	
	$("#sidebar").on("click", ".fullSpread", function() {
		$(this).addClass("button").removeClass("fullSpread")
	});
	
	
	$("#content").on("change", "#profiel", function() {
		
		profile = $(this).val()
		$(".set").removeClass("set")
		
		$.getJSON("profiles.json",function(profiles) {
			$("#total").val(profiles[profile]["total"][0])
			$.each(profiles[profile], function(v) {
				range = $("input[name="+v+"]")
				$("input[name="+v+"]").val(profiles[profile][v][0])
				$("progress").css("transition","1s all")
				adjustProgressToRange(range)
				$("progress").css("transition","0s")
			});
		}) 
		
	});
	
	
	function checkBBG(id) {
		parts = undefined
		if( localStorage.getItem("bbg-parts") !== null ) {
			parts = JSON.parse(localStorage.getItem("bbg-parts"))
		} else {
			$.getJSON("full_bbg.json", function(bbg) {
				parts = bbg		
				localStorage.setItem("bbg-parts",JSON.stringify(parts))
				
			});
		}
		
		id = String(id)
		
		for(system in parts) {
			console.log(system)
			for ( p in parts[system]["parts"]) {
				if ( id == parts[system]["parts"][p] ) {
					return [system, parts[system]["url"]]
				}
			}
		}
		
		return false
	}
	
	function createBasicTable( data, table ) {
		$.each(data, function() {	
			tr = $("<tr>");
			row = this;
			
			// Product name
			product = $("<td>")
			product.text(row[0])
			product.appendTo(tr) 
			
			// Product rating
			rating = $("<td>")
			rating.addClass("rating");
			stars = row[2]/20
			colors = [ "black", "red", "orange", "yellow", "purple", "pink" ]
					
			color = colors[ Math.round(stars) ]
			
			s = 0
			while( s < stars ) {
				star = $("<div>").addClass("star")
				star.addClass(color)
				star.appendTo(rating)
				s++;
			}
			while( s-stars < 0 ) {
				halfstar = $("<div>").addClass("halfstar")
				halfstar.addClass(color)
				halfstar.appendTo(rating)
				s+=0.5;
			}
			
			rating.appendTo(tr)
			
			reviews = $("<td>")
			reviews.text(row[3])
			reviews.appendTo(tr)
			
			price = $("<td>")
			price.addClass("price");
			price.text( row[1] + "€" )
			price.appendTo(tr)
			
			id = row[6]
			
			twkMarker = $("<td>")
			twkMarker.html("<a href='http://tweakers.net/pricewatch/"+id+"' target='_blank'><img src='img/twk.png'/></a>")
			twkMarker.attr("title","Vind dit artikel op Tweakers.net.")
			twkMarker.appendTo(tr)
			
			inBBG = checkBBG(id)
			if ( inBBG ) {
				bbgMarker = $("<td>")
				bbgMarker.html("<a href='"+inBBG[1]+"' target='_blank'><img src='img/bbg.png'/></a>")
				bbgMarker.attr("title","Dit artikel stond in de Tweakers.net Best Buy Guide van "+inBBG[0]+".")
				bbgMarker.appendTo(tr)
			}
			
			tr.appendTo(table)
		});
		return table;
	}
	
}); 
