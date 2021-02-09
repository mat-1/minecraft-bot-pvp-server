# python munch.py --download 1.16.5 --toppings entities,entitymetadata --output output.json

import json

with open('output.json', 'r') as f:
	burger_output = json.loads(f.read())

burger_output_entities = burger_output[0]['entities']['entity']

def get_entity_parent(entity_name):
	entity_metadata = burger_output_entities[entity_name]['metadata']
	first_metadata = entity_metadata[0]
	if 'entity' in first_metadata:
		return first_metadata['entity']
	else:
		return None

def get_entity_metadata(entity_name):
	entity_metadata = burger_output_entities[entity_name]['metadata']
	entity_useful_metadata = []
	for metadata_item in entity_metadata:
		if 'data' in metadata_item:
			for metadata_attribute in metadata_item['data']:
				entity_useful_metadata.append({
					'key': metadata_attribute['index'],
					'type': metadata_attribute['serializer_id'],
				})
	return entity_useful_metadata

def get_entity_parents(entity_name):
	parents = []
	while entity_name:
		parents.append(entity_name)
		entity_name = get_entity_parent(entity_name)
	return parents

processed_parents_output = {}
processed_metadata_output = {}


for entity_name, entity_data in burger_output_entities.items():
	entity_parents = get_entity_parents(entity_name)
	entity_metadata = get_entity_metadata(entity_name)
	processed_parents_output[entity_name] = entity_parents
	processed_metadata_output[entity_name] = entity_metadata

with open('entity_parents.json', 'w') as f:
	f.write(json.dumps(processed_parents_output, indent='\t'))
with open('entity_metadata.json', 'w') as f:

	f.write(json.dumps(processed_metadata_output, indent='\t'))