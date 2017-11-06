import * as restify from 'restify';
import * as builder from 'botbuilder';
var GeoPoint = require('geopoint');
var config   = require('./config');
const Yelp   = require('node-yelp-api-v3');

const yelp = new Yelp({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret
});

var googleMapsClient = require('@google/maps').createClient({
  key: config.google.maps_key
});

// Setup Restify Server
let server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});

let url = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/1e7b9493-01f1-4a30-bad3-4678d032f9cd?subscription-key=cad2208ebf9b48a1a3680e5b6648950a&staging=true&verbose=true&timezoneOffset=0&q=';
let recognizer = new builder.LuisRecognizer(url);
let intents = new builder.IntentDialog({ recognizers: [recognizer] });

var connector = new builder.ChatConnector();

// Listen for messages from users 
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector);

bot.dialog('/', intents);

function search(savedRestos, locationCoords, foodType) {
	console.log("-------- LOOKING FOR A RESTO : " + foodType + " at " + locationCoords + " ----------");
	var compatibleRestos = [];
	for (var resto of savedRestos) {
//		console.log(resto);
		if(resto != null) {
			for (var cat of resto.categories) {
				if(cat.title.toLowerCase() == foodType) {
					//console.log(locationCoords);
				    let point1 = new GeoPoint(locationCoords.lat, locationCoords.lng);
					//console.log(point1);
					let point2 = new GeoPoint(resto.coordinates.latitude, resto.coordinates.longitude);
					//console.log(point2);
					let distance = point1.distanceTo(point2, true)
					//console.log("Distance: " + distance);
					if(distance < 1) {
						compatibleRestos.push(resto);
					}
				}
			}
		}
	}
	//console.log(compatibleRestos);
	return compatibleRestos;
}

intents.matches('greetings', [
    (session, args, next) => {
        session.send(`Bonjour ! Je suis RestoBot ! Je suis là pour vous rappeler les restos de Paris que vous voulez tester !`);
    }
]);

intents.matches('getHelp', [
    (session, args, next) => {
        session.send(`Vous pouvez me demander de sauvegarder un restaurant pour plus tard ou chercher un restaurant que vous avez précédement sauvegardé.`);
        session.send('Essayez par exemple : "rappelle-moi de tester le Candelaria" ou "Je recherche une pizzeria" ou encore "je veux manger un burger".')
    }
]);

intents.matches('giveLocation', [
    (session, args, next) => {
        let location = builder.EntityRecognizer.findEntity(args.entities, 'location'); // Extraction d'entité
        if(location == null) {
        	session.send(`Hum, je n'ai pas bien compris. Est-ce que c'est à Paris ? Pouvez-vous reformuler, s'il vous plait ?`);         	
        } else {
			session.userData.location = location.entity;
			googleMapsClient.geocode({
				address: 'métro ' + location.entity + ', Paris, France'
			}, function(err, response) {
				if (!err) {
					session.userData.locationCoords = response.json.results[0].geometry.location;
			        let restosFound = search(session.userData.savedRestos, session.userData.locationCoords, session.userData.foodType);
			        if(restosFound[0] != null) {
				        session.send(`Voici ce que je vous propose : ${restosFound[0].name}.`);
			        } else {
				        session.send(`Désolé, aucun resto sauvegardé ne correspond.`);
			        }
				} else {
				    session.send(`Désolé, je n'ai pas compris où vous êtes...`);    
				}
			});
			if(session.userData.foodType == null) {
		        session.send(`Quelle type de restaurant chercher à ${session.userData.location} ?`);
			} else {
		        session.send(`Je recherche ${session.userData.foodType} vers ${session.userData.location}...`);
			}
	    }
    }
]);

intents.matches('congrats', [
    (session, args, next) => {
    	let tanksMessages = [`Je suis touché.`, 
    						`J'adore ce job !`, 
    						`Merci.`,
    						`☺`,
    						`😃`,
    						`😻`,
					    	`Content que ça vous plaise !`, 
					    	`Votre satisfaction, c'est mon moteur.`];
        session.send(tanksMessages);
	    session.userData.savedRestos = [];
    }
]);

intents.matches('saveRestaurant', [
    (session, args, next) => {
		session.sendTyping();
    	if(session.userData.savedRestos == null) {
	    	session.userData.savedRestos = [];
    	}
        let restoName = builder.EntityRecognizer.findEntity(args.entities, 'restoName'); // Extraction d'entité
        if(restoName != null) {
			// yelp.searchBusiness(params);
			yelp.searchBusiness({ term: restoName.entity, location: "Paris", categories: "restaurants", locale: "fr_FR", limit:1 }).then((results) => {
				console.log(results.businesses[0]);
				session.userData.savedRestos.push(results.businesses[0]);
				//session.send()

				var msg = new builder.Message(session)
					          .text(`Ok, je te rapplerai d'aller au restaurant ${results.businesses[0].name}, ${results.businesses[0].location.address1}.`)
					          .addAttachment({
					            contentUrl: results.businesses[0].image_url,
					            contentType: "image/jpeg",
					            name: results.businesses[0].name
   					          });  
				session.send(msg);
			}).catch((err) => {
	        	session.send(`Hum, vous êtes certain que ça s'écrit comme ça ?`); 
			});
        } else {
        	session.send(`Hum, je n'ai pas bien compris. Pouvez-vous reformuler, s'il vous plait ?`); 
        }
    }
]);

intents.matches('listSavedResto', [
    (session, args, next) => {
    	if(session.userData.savedRestos == null) {
			session.send(`Hum, je ne crois pas que vous m'ayez demandé de retenir des restos pour l'instant.`);
    	} else {
	    	let restosTxt = session.userData.savedRestos
	    						.map(function(elem){
								    return elem.name;
								}).join(', ');
	        session.send(`Voici tous les restaurants dont je me souviens : ${restosTxt}`);
    	}
    }
]);

intents.matches('listRestaurants', [
    (session, args, next) => {
        let foodType = builder.EntityRecognizer.findEntity(args.entities, 'foodType'); // Extraction d'entité
    	if(foodType == null) {
        	session.send(`Hum, je n'ai pas bien compris. Pouvez-vous reformuler, s'il vous plait ?`); 
    	} else {
    		session.userData.foodType = foodType.entity;   
    		if(session.userData.location == null) {
		        session.send(`Vers quel métro voulez-vous chercher ${session.userData.foodType} ?`);
    		} else {
		        session.send(`Je recherche ${session.userData.foodType} vers ${session.userData.location}...`);
		        let restosFound = search(session.userData.savedRestos, session.userData.locationCoords, session.userData.foodType);
		        if(restosFound[0] != null) {
			        session.send(`Voici ce que je vous propose : ${restosFound[0].name}.`);
		        } else {
			        session.send(`Désolé, aucun resto sauvegardé ne correspond.`);
		        }
    		}
	    }
    }
]);

intents.matches('insultMe', [
    (session, args, next) => {
    	session.conversationData.insultCount++;
    	if(session.conversationData.insultCount % 3 == 2) {
    		session.send(['Vous avez demandé la suppression de votre compte Facebook, merci de patienter.', 'Merci de patienter pendant que nous mettons à jour votre compte Linkedin avec ces insultes...', 'Vous êtes en contact avec la Gendarmerie Nationnale, nous allons vous répondre, merci de patienter.']);
    		setTimeout(function () {
		    	session.send('3...');
	    		setTimeout(function () {
		    		session.send('2...');
		    		setTimeout(function () {
			    		session.send('1...');
			    		setTimeout(function () {
				    		session.send('Je plaisante. Pour cette fois, ça passe. Mais que je ne vous y reprenne plus.');
			    	    }, 2000);
				    }, 1000);
			    }, 1000);
		    }, 1000);
    	} else {
	    	if(session.conversationData.insultCount > 10) {
		        session.send([`C'est celui qui le dit qui l'est.`, `Mirroir !`, `😤`]);				
			} else {
		    	let stopMessages = [
			    						`Je vous demande de vous arrêter !`, 
			    						`Est-ce que je vous parle sur ce ton ?`, 
								    	`Restez poli, s'il vous plait !`, 
								    	`☹️`, 
								    	`😰`, 
								    	`Vous voulez que je prévienne votre mère ?`, 
								    	`De mon temps on respectait les robots.`, 
								    	`Ce n'est pas parce que je suis un robot que je n'ai pas de sentiments.`
							    	];
		        session.send(stopMessages);
		    }
	        // faire une pause
	    	if(session.conversationData.insultCount == 1) {
	            setTimeout(function () {
			        session.send(`Aller, on repart sur des bonnes bases. Si vous avez besoin d'aide, n'hésitez pas à demander !`);
			    }, 3000);
	        }
	    }
    }
]);

intents.matches('poserUneColle', [
    (session, args, next) => {
        let foodType = builder.EntityRecognizer.findEntity(args.entities, 'foodType'); // Extraction d'entité
        if(foodType != null) {
	        session.send(`Ok, je recherche des restos de ${foodType.entity}`);
        }
        let msgColle = [
        	`Hum... je ne suis pas entrainé pour cela. Demandez-moi de l'aide !`,
        	`🤔 Ça je ne sais pas. Demandez-moi de l'aide !`,
        	`Je ne fais pas non plus le café. Demandez-moi de l'aide !`
        ];
        session.send(msgColle);
    }
]);

intents.matches('None', [
    (session, args, next) => {
        session.send(`Oups... Je n'ai pas compris votre demande...`);
    }
]);

