LABELS = [
    # AST
    "LOOP",
    "CONDITIONAL",
    "ERROR_HANDLING",
    "STATE",
    "FUNCTION_CALL",
    "CLASS_DEF",
    "ASYNC",

    # DOCSTRING
    "AUTH",
    "NETWORK",
    "FILE_IO",
    "DATABASE",
    "MATH",
    "STRING",
    "VALIDATION",
# ]

# LABELS = [
    
    # --- Data movement / IO ---
    "READ_DATA",           # reading from file/input/source
    "WRITE_DATA",          # writing/saving output
    "LOAD_RESOURCE",       # loading configs/models/files
    "SAVE_RESULT",         # persisting results

    # --- Transformation ---
    "DATA_TRANSFORM",      # mapping/conversion
    "DATA_FILTER",         # filtering/selecting
    "DATA_AGGREGATE",      # sum/group/reduce
    "DATA_PARSE",          # parsing raw input
    "DATA_FORMAT",         # formatting output

    # --- Control / Flow ---
    "CONTROL_FLOW",        # orchestrating execution
    "BRANCHING_LOGIC",     # decision making
    "ITERATIVE_PROCESS",   # repeated processing

    # --- State / Structure ---
    "STATE_UPDATE",        # modifying state
    "OBJECT_MANAGEMENT",   # creating/managing objects
    "CONFIG_HANDLING",     # config/env usage

    # --- Interaction ---
    "USER_INPUT",          # handling user input
    "USER_OUTPUT",         # displaying to user
    "EXTERNAL_CALL",       # calling APIs/services
    "INTERPROCESS_COMM",   # process/service comms

    # --- Errors / Safety ---
    "ERROR_RECOVERY",      # handling failures
    "SANITIZATION",        # cleaning inputs

    # --- Execution style ---
    "ASYNC_EXECUTION",     # async behavior
    "TASK_SCHEDULING",     # delayed/repeated tasks
    "PARALLEL_EXECUTION",  # concurrent work

    # --- Computation ---
    "CALCULATION",         # math/logic computation
    "SEARCH",              # lookup/search logic
    "SORTING",             # ordering data
    "OPTIMIZATION",        # improving performance

    # --- Text / Content ---
    "STRING_PROCESSING",   # manipulating text
    "TEXT_ANALYSIS",       # extracting meaning
    "SERIALIZATION",       # encode/decode (json etc)

    # --- Files / System ---
    "FILE_MANIPULATION",   # file ops
    "PATH_HANDLING",       # filesystem paths
    "PROCESS_CONTROL",     # subprocesses

    # --- Networking ---
    "REQUEST_HANDLING",    # making requests
    "RESPONSE_PROCESSING", # handling responses
    "DATA_FETCHING",       # retrieving remote data

    # --- Application behavior ---
    "INITIALIZATION",      # setup/init logic
    "CLEANUP",             # teardown/release
    "LOGGING",             # logging activity
    "MONITORING",          # tracking state/metrics

    # --- Higher-level intent ---
    "AUTOMATION_TASK",     # scripted workflow
    "PIPELINE_STEP",       # part of pipeline
    "INTEGRATION",         # glue between systems
    "WRAPPER",             # wrapping functionality
]
